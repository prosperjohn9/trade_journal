import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchHistoricalDeals,
  buildFromDeals,
  getAccountStatus,
  deployAccount,
  undeployAccount,
  waitUntilConnected,
  removeMetaApiAccount,
  DEFAULT_MT_REGION,
} from '@/src/lib/integrations/metaapi';
import {
  computePropStatus,
  type PropRules,
} from '@/src/lib/analytics/propFirm';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';
import { adminUserIdSet } from '@/src/lib/auth/admin';

const DAY_MS = 86_400_000;

export type SyncConnection = {
  id: string;
  account_id: string;
  metaapi_account_id: string;
  region: string | null;
  last_synced_at?: string | null;
  created_at?: string | null;
  // When true, the Foresight worker keeps this account deployed 24/7 and owns its
  // deploy/undeploy lifecycle, so a sync must NOT undeploy it afterwards.
  guard_enabled?: boolean | null;
};

export type SyncResult = {
  connectionId: string;
  imported: number;
  skipped: number;
  /** The account breached its prop rules and auto-sync was disconnected. */
  breached?: boolean;
  error?: string;
};

export type RefreshKind = 'manual' | 'auto';

function startOfMonthIso(now: number = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/**
 * How many MANUAL broker refreshes the user has spent since the start of the
 * current calendar month (UTC). Enforces the per-plan monthly cap. Counts under
 * RLS so it only sees the caller's own rows.
 */
export async function manualRefreshCount(
  sb: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await sb
    .from('mt_refreshes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'manual')
    .gte('created_at', startOfMonthIso());
  if (error) return 0; // fail open; the deploy itself is still the hard cost cap
  return count ?? 0;
}

/**
 * Cost guard: when a prop account has crossed its configured drawdown rules,
 * the account is dead at the firm, so keeping it on MetaApi only burns money.
 * Recompute prop status from the freshly synced trades; on breach, remove the
 * MetaApi account (stops ALL metering) and flag the connection so the UI can
 * explain. The user can reconnect manually if their configured rules were
 * wrong. Returns true when a disconnect happened.
 */
async function checkBreachAndDisconnect(
  sb: SupabaseClient,
  c: SyncConnection,
): Promise<boolean> {
  try {
    const { data: acct } = await sb
      .from('accounts')
      .select('starting_balance, prop_rules')
      .eq('id', c.account_id)
      .maybeSingle();
    const rules = ((acct as { prop_rules?: unknown } | null)?.prop_rules ??
      null) as PropRules | null;
    if (!rules || (rules.maxDrawdownPct == null && rules.dailyLossPct == null)) {
      return false;
    }

    const [{ data: trades }, { data: events }] = await Promise.all([
      sb
        .from('trades')
        .select('opened_at, closed_at, net_pnl, pnl_amount, commission')
        .eq('account_id', c.account_id),
      sb
        .from('account_balance_events')
        .select('kind, amount, occurred_at')
        .eq('account_id', c.account_id),
    ]);

    const propTrades = (
      (trades ?? []) as Array<{
        opened_at: string;
        closed_at: string | null;
        net_pnl: number | null;
        pnl_amount: number | null;
        commission: number | null;
      }>
    ).map((t) => ({
      at: t.closed_at ?? t.opened_at,
      pnl:
        t.net_pnl != null
          ? Number(t.net_pnl)
          : Number(t.pnl_amount ?? 0) - Number(t.commission ?? 0),
    }));
    const cashflows = (
      (events ?? []) as Array<{
        kind: string;
        amount: number;
        occurred_at: string;
      }>
    ).map((e) => ({
      at: e.occurred_at,
      amount: e.kind === 'DEPOSIT' ? Number(e.amount) : -Number(e.amount),
    }));

    const status = computePropStatus({
      startingBalance: Number(
        (acct as { starting_balance?: number | null } | null)
          ?.starting_balance ?? 0,
      ),
      rules,
      trades: propTrades,
      cashflows,
    });
    if (status.status !== 'breached') return false;

    try {
      await removeMetaApiAccount(c.metaapi_account_id);
    } catch {
      // best-effort; the connection flag below still stops our cron
    }
    await sb
      .from('mt_connections')
      .update({
        state: 'breached',
        last_error:
          'This account hit its prop drawdown rules, so auto-sync was disconnected to stop sync charges. All trades are kept.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id);
    // A breached challenge is dead, so archive it out of the main list. The user
    // can unarchive it any time; all trades are kept either way.
    await sb.from('accounts').update({ archived: true }).eq('id', c.account_id);
    return true;
  } catch {
    return false; // never fail a sync over the breach check
  }
}

/**
 * Cost guard for the shrinking-cap case. When a user's synced-account
 * entitlement drops below the number of MetaTrader accounts they have connected
 * (an extra-sync add-on lapsed, or they downgraded a plan), the surplus accounts
 * would otherwise keep deploying and billing MetaApi with no paid slot behind
 * them. Keep the oldest `limit` connections; suspend the rest by removing their
 * MetaApi account (stops ALL metering) and flagging state='over_limit' so the
 * cron skips them and the UI can explain. Renewing the add-on (or disconnecting
 * another account) and reconnecting brings one back. Returns how many were
 * suspended. Pass a service-role client: this spans every user. Best-effort:
 * never throws, so it can never break the cron run that calls it.
 */
export async function enforceSyncCaps(sb: SupabaseClient): Promise<number> {
  let suspended = 0;
  try {
    const [{ data: connections }, { data: subs }] = await Promise.all([
      sb
        .from('mt_connections')
        .select('id, metaapi_account_id, user_id, created_at, state')
        .order('created_at', { ascending: true }),
      sb.from('subscriptions').select(`user_id, ${SUBSCRIPTION_SELECT}`),
    ]);

    // Current synced-account allowance per user (0 when unentitled).
    const limitByUser = new Map<string, number>();
    for (const s of (subs ?? []) as Array<SubscriptionRow & { user_id: string }>) {
      const ent = resolveEntitlements(s);
      limitByUser.set(s.user_id, ent.entitled ? ent.limits.syncedAccounts : 0);
    }

    // Live connections grouped by user, oldest first (the query is ordered asc).
    // Breached / already-suspended accounts have no MetaApi account, cost
    // nothing, and so never count toward the cap.
    const byUser = new Map<
      string,
      Array<{ id: string; metaapi_account_id: string }>
    >();
    for (const c of (connections ?? []) as Array<{
      id: string;
      metaapi_account_id: string;
      user_id: string;
      state: string | null;
    }>) {
      if (c.state === 'breached' || c.state === 'over_limit') continue;
      const arr = byUser.get(c.user_id) ?? [];
      arr.push({ id: c.id, metaapi_account_id: c.metaapi_account_id });
      byUser.set(c.user_id, arr);
    }

    // The owner/admin is exempt from the cap (unlimited synced accounts).
    const adminIds = await adminUserIdSet(sb);

    for (const [userId, conns] of byUser) {
      if (adminIds.has(userId)) continue; // owner accounts are never capped
      const limit = limitByUser.get(userId) ?? 0;
      if (conns.length <= limit) continue;
      // Oldest `limit` stay live; suspend everything past the cap.
      for (const c of conns.slice(limit)) {
        try {
          await removeMetaApiAccount(c.metaapi_account_id);
        } catch {
          // best-effort; the state flag below still stops the cron
        }
        await sb
          .from('mt_connections')
          .update({
            state: 'over_limit',
            last_error:
              'Auto-sync paused: this account is over your plan limit. An extra-sync add-on lapsed or your plan changed. Renew the add-on or disconnect another account, then reconnect to resume. Your trades are kept.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.id);
        suspended += 1;
      }
    }
  } catch {
    // Cost control is best-effort; never break the caller (the cron run).
  }
  return suspended;
}

/** Record one refresh (one account sync / MetaApi deploy). Best-effort. */
export async function logRefresh(
  sb: SupabaseClient,
  userId: string,
  connectionId: string,
  kind: RefreshKind,
): Promise<void> {
  await sb
    .from('mt_refreshes')
    .insert({ user_id: userId, connection_id: connectionId, kind });
}

/**
 * Foresight-enhanced sync. Guarded trades had their stop, target, and dollar
 * risk captured live at entry in foresight_reads, but the broker's deal history
 * rarely carries them. Backfill any synced trade on this account that is still
 * missing a stop, target, or risk from its matching Foresight read (matched by
 * position id). Only fills nulls, so it never overwrites what the user typed.
 * Best-effort: never throws, so it can never break a sync.
 */
async function backfillForesightLevels(
  sb: SupabaseClient,
  accountId: string,
): Promise<void> {
  try {
    const { data: reads } = await sb
      .from('foresight_reads')
      .select('position_id, stop_loss, take_profit, risk_money, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    const readRows = (reads ?? []) as Array<{
      position_id: string;
      stop_loss: number | null;
      take_profit: number | null;
      risk_money: number | null;
    }>;
    if (!readRows.length) return;

    // Latest read per position wins (rows are newest-first), so a moved stop is
    // reflected.
    const byPosition = new Map<
      string,
      { stop_loss: number | null; take_profit: number | null; risk_money: number | null }
    >();
    for (const r of readRows) {
      if (!byPosition.has(r.position_id)) byPosition.set(r.position_id, r);
    }

    const { data: trades } = await sb
      .from('trades')
      .select('id, external_id, stop_loss, take_profit, risk_amount')
      .eq('account_id', accountId)
      .like('external_id', 'metaapi:%')
      .or('stop_loss.is.null,take_profit.is.null,risk_amount.is.null');
    const tradeRows = (trades ?? []) as Array<{
      id: string;
      external_id: string;
      stop_loss: number | null;
      take_profit: number | null;
      risk_amount: number | null;
    }>;

    for (const t of tradeRows) {
      const read = byPosition.get(t.external_id.replace(/^metaapi:/, ''));
      if (!read) continue;
      const patch: Record<string, number> = {};
      if (t.stop_loss == null && read.stop_loss != null)
        patch.stop_loss = read.stop_loss;
      if (t.take_profit == null && read.take_profit != null)
        patch.take_profit = read.take_profit;
      if (t.risk_amount == null && read.risk_money != null)
        patch.risk_amount = Math.round(read.risk_money * 100) / 100;
      if (Object.keys(patch).length === 0) continue;
      await sb.from('trades').update(patch).eq('id', t.id);
    }
  } catch {
    // best-effort; never break a sync over the backfill
  }
}

/**
 * Sync one MetaTrader connection with deploy-on-demand: make sure the account is
 * deployed and connected, pull its full raw deal history (free MetaApi API), pair
 * the deals into trades in-house, upsert idempotently via external_id, then
 * undeploy to stop hosting cost. Works with the user's RLS-scoped client (manual
 * sync) or the service-role client (scheduled sync).
 */
export async function syncConnection(
  sb: SupabaseClient,
  c: SyncConnection,
  userId: string,
): Promise<SyncResult> {
  const nowIso = () => new Date().toISOString();
  let undeployWhenDone = false;
  try {
    const region = c.region ?? DEFAULT_MT_REGION;

    // Deploy-on-demand: make sure the account is running and connected before we
    // read history, so we only pay MetaApi while we actually need it.
    const status = await getAccountStatus(c.metaapi_account_id);
    if (status.state !== 'DEPLOYED' && status.state !== 'DEPLOYING') {
      await deployAccount(c.metaapi_account_id);
    }
    if (status.connectionStatus !== 'CONNECTED') {
      const connected = await waitUntilConnected(c.metaapi_account_id, {
        timeoutMs: 45_000,
      });
      if (!connected) {
        // Still connecting. Leave it deployed (same 6-hour billing window) so the
        // connection finishes in the background; never undeploy mid-connect.
        await sb
          .from('mt_connections')
          .update({ state: 'connecting', updated_at: nowIso() })
          .eq('id', c.id);
        const firstTime = !c.last_synced_at;
        const ageMin = c.created_at
          ? (Date.now() - new Date(c.created_at).getTime()) / 60_000
          : 0;
        // A genuine first connect can take a few minutes. But if a never-synced
        // account still cannot reach the broker after that, the cause is almost
        // always the credentials or server, not latency, so say so plainly
        // instead of telling them to keep retrying forever.
        const stuck = firstTime && ageMin > 4;
        return {
          connectionId: c.id,
          imported: 0,
          skipped: 0,
          error: stuck
            ? 'Still cannot reach the broker after a few minutes. Double-check this account: the server name must match your broker exactly (for example FundingPips-SIM1), and the investor (read-only) password must be enabled for this login. A breached or disabled account will not connect.'
            : firstTime
              ? 'Your account is connecting to the broker for the first time. This can take a few minutes, then tap Sync now again.'
              : 'Your account is reconnecting to the broker. Give it a moment, then tap Sync now again.',
        };
      }
    }
    undeployWhenDone = true;

    // Pull the full raw deal history (free) and pair it into trades in-house.
    // Full history each time: an incremental window would miss the funding row
    // and older trades; dedup on external_id keeps it idempotent.
    const from = new Date('2000-01-01T00:00:00Z');
    const to = new Date(Date.now() + DAY_MS);
    const deals = await fetchHistoricalDeals({
      metaApiAccountId: c.metaapi_account_id,
      region,
      from,
      to,
    });

    const { data: acct } = await sb
      .from('accounts')
      .select('starting_balance')
      .eq('id', c.account_id)
      .maybeSingle();

    const {
      initialBalance,
      balanceEvents,
      trades: rows,
    } = buildFromDeals(deals, {
      userId,
      accountId: c.account_id,
      fallbackStartingBalance:
        (acct as { starting_balance: number | null } | null)?.starting_balance ??
        null,
    });

    if (initialBalance != null && initialBalance > 0) {
      await sb
        .from('accounts')
        .update({ starting_balance: initialBalance })
        .eq('id', c.account_id);
    }

    if (balanceEvents.length) {
      const exIds = balanceEvents.map((e) => e.external_id);
      const { data: existingEv } = await sb
        .from('account_balance_events')
        .select('external_id')
        .eq('account_id', c.account_id)
        .in('external_id', exIds);
      const haveEv = new Set(
        (existingEv ?? []).map((e: { external_id: string }) => e.external_id),
      );
      const newEvents = balanceEvents.filter((e) => !haveEv.has(e.external_id));
      if (newEvents.length) {
        await sb.from('account_balance_events').insert(newEvents);
      }
    }

    let imported = 0;
    let skipped = 0;
    if (rows.length) {
      const ids = rows.map((r) => r.external_id);
      const { data: existing } = await sb
        .from('trades')
        .select('external_id')
        .eq('account_id', c.account_id)
        .in('external_id', ids);
      const have = new Set(
        (existing ?? []).map((e: { external_id: string }) => e.external_id),
      );
      const toInsert = rows.filter((r) => !have.has(r.external_id));
      skipped = rows.length - toInsert.length;
      if (toInsert.length) {
        const { error: insErr } = await sb.from('trades').insert(toInsert);
        if (insErr) throw new Error(insErr.message);
        imported = toInsert.length;
      }
    }

    // Fill any synced trade still missing a stop, target, or risk from its live
    // Foresight read (guarded accounts only; no-op otherwise).
    await backfillForesightLevels(sb, c.account_id);

    await sb
      .from('mt_connections')
      .update({
        last_synced_at: nowIso(),
        state: 'connected',
        last_error: null,
        updated_at: nowIso(),
      })
      .eq('id', c.id);

    // With fresh trades in, check the prop rules; a breached account is
    // auto-disconnected so it stops costing anyone money.
    const breached = await checkBreachAndDisconnect(sb, c);

    return { connectionId: c.id, imported, skipped, breached };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed';
    await sb
      .from('mt_connections')
      .update({
        state: 'error',
        last_error: msg.slice(0, 500),
        updated_at: nowIso(),
      })
      .eq('id', c.id);
    return { connectionId: c.id, imported: 0, skipped: 0, error: msg };
  } finally {
    // Cost control: stop hosting once we've pulled history. Best-effort; the
    // daily cron reconciles any account left deployed.
    //
    // EXCEPTION: a guard_enabled account is kept deployed 24/7 by the Foresight
    // worker, which owns its deploy lifecycle. Undeploying it here would rip it
    // out from under the worker; the worker would just redeploy it, restarting
    // the broker handshake and leaving the account flapping "Disconnected". So we
    // never undeploy a guarded account on sync.
    if (undeployWhenDone && !c.guard_enabled) {
      try {
        await undeployAccount(c.metaapi_account_id);
      } catch {
        // ignore
      }
    }
  }
}
