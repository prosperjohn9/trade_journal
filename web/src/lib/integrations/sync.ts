import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchHistoricalDeals,
  buildFromDeals,
  getAccountStatus,
  deployAccount,
  undeployAccount,
  waitUntilConnected,
  DEFAULT_MT_REGION,
} from '@/src/lib/integrations/metaapi';

const DAY_MS = 86_400_000;

export type SyncConnection = {
  id: string;
  account_id: string;
  metaapi_account_id: string;
  region: string | null;
  last_synced_at?: string | null;
};

export type SyncResult = {
  connectionId: string;
  imported: number;
  skipped: number;
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
        return {
          connectionId: c.id,
          imported: 0,
          skipped: 0,
          error: firstTime
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

    await sb
      .from('mt_connections')
      .update({
        last_synced_at: nowIso(),
        state: 'connected',
        last_error: null,
        updated_at: nowIso(),
      })
      .eq('id', c.id);

    return { connectionId: c.id, imported, skipped };
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
    if (undeployWhenDone) {
      // Cost control: stop hosting once we've pulled history. Best-effort; the
      // daily cron reconciles any account left deployed.
      try {
        await undeployAccount(c.metaapi_account_id);
      } catch {
        // ignore
      }
    }
  }
}
