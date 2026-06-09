import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchHistoricalTrades,
  mapTradeToRow,
  splitBalanceOps,
  DEFAULT_MT_REGION,
} from '@/src/lib/integrations/metaapi';

const DAY_MS = 86_400_000;

export type SyncConnection = {
  id: string;
  account_id: string;
  metaapi_account_id: string;
  region: string | null;
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
 * Pull paired trades and balance operations for one MetaTrader connection and
 * upsert them (idempotent via external_id), then update the connection's sync
 * state. Works with any Supabase client, the user's RLS-scoped client (manual
 * sync) or the service-role client (scheduled sync).
 */
export async function syncConnection(
  sb: SupabaseClient,
  c: SyncConnection,
  userId: string,
): Promise<SyncResult> {
  try {
    const region = c.region ?? DEFAULT_MT_REGION;
    // Always pull full history. An incremental window would exclude the original
    // funding row (which sets starting_balance) and older trades, so re-syncs
    // would never correct the balance. Dedup makes this idempotent.
    const from = new Date('2000-01-01T00:00:00Z');
    const to = new Date(Date.now() + DAY_MS);

    const trades = await fetchHistoricalTrades({
      metaApiAccountId: c.metaapi_account_id,
      region,
      from,
      to,
    });

    const { initialBalance, events: balanceEvents } = splitBalanceOps(trades, {
      userId,
      accountId: c.account_id,
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

    const rows = trades
      .map((t) => mapTradeToRow(t, { userId, accountId: c.account_id }))
      .filter((r): r is NonNullable<typeof r> => r !== null);

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
        last_synced_at: new Date().toISOString(),
        state: 'connected',
        last_error: null,
        updated_at: new Date().toISOString(),
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id);
    return { connectionId: c.id, imported: 0, skipped: 0, error: msg };
  }
}
