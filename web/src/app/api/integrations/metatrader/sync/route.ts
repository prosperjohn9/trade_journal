import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import {
  fetchHistoricalTrades,
  mapTradeToRow,
  splitBalanceOps,
  DEFAULT_MT_REGION,
} from '@/src/lib/integrations/metaapi';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/integrations/metatrader/sync
//
// Body (optional): { connectionId }  — sync just one connection, else all of
// the user's connections. Pulls paired trades from MetaStats, dedups on
// external_id, and inserts new ones into the linked trading account.

const DAY_MS = 86_400_000;

type Connection = {
  id: string;
  account_id: string;
  metaapi_account_id: string;
  region: string | null;
  last_synced_at: string | null;
};

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { connectionId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  let query = sb
    .from('mt_connections')
    .select('id, account_id, metaapi_account_id, region, last_synced_at')
    .eq('user_id', user.id);
  if (body.connectionId) query = query.eq('id', body.connectionId);

  const { data: connections, error: connErr } = await query;
  if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 });

  const results: Array<{
    connectionId: string;
    imported: number;
    skipped: number;
    error?: string;
  }> = [];

  for (const c of (connections ?? []) as Connection[]) {
    try {
      const region = c.region ?? DEFAULT_MT_REGION;
      const from = c.last_synced_at
        ? new Date(new Date(c.last_synced_at).getTime() - 2 * DAY_MS)
        : new Date('2000-01-01T00:00:00Z');
      const to = new Date(Date.now() + DAY_MS);

      const trades = await fetchHistoricalTrades({
        metaApiAccountId: c.metaapi_account_id,
        region,
        from,
        to,
      });

      // Broker balance operations: the earliest funds the account (-> starting
      // balance), so the equity curve reflects reality instead of a number typed
      // at account creation; the rest become deposit/withdrawal ledger events.
      const { initialBalance, events: balanceEvents } = splitBalanceOps(trades, {
        userId: user.id,
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
        .map((t) => mapTradeToRow(t, { userId: user.id, accountId: c.account_id }))
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

      results.push({ connectionId: c.id, imported, skipped });
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
      results.push({ connectionId: c.id, imported: 0, skipped: 0, error: msg });
    }
  }

  return NextResponse.json({ results });
}
