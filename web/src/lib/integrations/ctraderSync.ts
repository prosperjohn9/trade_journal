// cTrader sync: discover a user's accounts over the Open API socket, pull their
// deal history, pair it into trades, and upsert (idempotent via external_id), the
// cTrader counterpart of the MetaApi deploy-on-demand sync. cTrader sync is free
// (Spotware has no per-account fee), so this runs without the synced-account cap.

import type { createServiceClient } from '@/src/lib/supabase/admin';
import type { ImportedTradeRow } from '@/src/lib/integrations/metaapi';
import { refreshCtraderToken } from '@/src/lib/integrations/ctrader';
import {
  CtraderSession,
  type CtraderEnv,
  type CtraderDeal,
  type CtraderAccount,
} from '@/src/lib/integrations/ctraderSocket';

type Admin = ReturnType<typeof createServiceClient>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pair cTrader deals (grouped by position) into closed-trade rows.
 *  account_id is left blank; the caller assigns it once the account exists. */
export function pairCtraderDeals(
  deals: CtraderDeal[],
  symbols: Map<number, string>,
  userId: string,
): ImportedTradeRow[] {
  const byPosition = new Map<number, CtraderDeal[]>();
  for (const d of deals) {
    const arr = byPosition.get(d.positionId) ?? [];
    arr.push(d);
    byPosition.set(d.positionId, arr);
  }

  const rows: ImportedTradeRow[] = [];
  for (const [positionId, group] of byPosition) {
    group.sort((a, b) => a.executionTimestamp - b.executionTimestamp);
    const opens = group.filter((d) => !d.close);
    const closes = group.filter((d) => d.close);
    if (!closes.length) continue; // position still open

    const open = opens[0] ?? group[0];
    const lastClose = closes[closes.length - 1];
    const cp = lastClose.close!;

    // Realized money: sum across closing deals, each scaled by its moneyDigits.
    let gross = 0;
    let swap = 0;
    let comm = 0;
    for (const c of closes) {
      const cd = c.close!;
      const s = Math.pow(10, cd.moneyDigits || 2);
      gross += cd.grossProfit / s;
      swap += cd.swap / s;
      comm += cd.commission / s;
    }
    const net = gross + swap + comm;

    // Position direction is the OPENING side (closing is the opposite).
    const direction: 'BUY' | 'SELL' = opens.length
      ? open.tradeSide
      : lastClose.tradeSide === 'BUY'
        ? 'SELL'
        : 'BUY';

    const closedVol = closes.reduce(
      (s, c) => s + (c.close!.closedVolume || c.filledVolume),
      0,
    );
    // cTrader volume is in cents of units; forex 1 lot = 10,000,000. Non-forex
    // contract sizes differ, so this is a best-effort lot figure (P&L is exact).
    const lots = closedVol > 0 ? round2(closedVol / 10_000_000) : null;

    const scale = Math.pow(10, cp.moneyDigits || 2);
    const balAfter = cp.balance / scale;
    const prevBal = balAfter - net;
    const pnlPercent = prevBal > 0 ? round2((net / prevBal) * 100) : 0;

    rows.push({
      user_id: userId,
      account_id: '',
      external_id: `ctrader:${positionId}`,
      import_source: 'ctrader',
      instrument:
        symbols.get(open.symbolId) ??
        symbols.get(lastClose.symbolId) ??
        `SYM${open.symbolId}`,
      direction,
      outcome: net > 0 ? 'WIN' : net < 0 ? 'LOSS' : 'BREAKEVEN',
      opened_at: new Date(open.executionTimestamp).toISOString(),
      closed_at: new Date(lastClose.executionTimestamp).toISOString(),
      entry_price: cp.entryPrice || open.executionPrice || null,
      exit_price: lastClose.executionPrice || null,
      stop_loss: null,
      take_profit: null,
      volume: lots,
      pnl_amount: round2(gross),
      pnl_percent: pnlPercent,
      net_pnl: round2(net),
      commission: round2(-(comm + swap)), // positive = net cost (mirrors MetaApi)
      risk_amount: null,
      r_multiple: null,
    });
  }
  return rows;
}

async function ensureAccount(
  admin: Admin,
  userId: string,
  conn: { id: string; account_id: string | null },
  acc: CtraderAccount,
  meta: { currency: string; startingBalance: number },
): Promise<string> {
  if (conn.account_id) return conn.account_id;
  const name = `${acc.brokerTitleShort || 'cTrader'} ${acc.traderLogin}`
    .trim()
    .slice(0, 60);
  const { data, error } = await admin
    .from('accounts')
    .insert({
      user_id: userId,
      name,
      account_type: acc.isLive ? 'Live' : 'Demo',
      base_currency: meta.currency,
      starting_balance: meta.startingBalance,
    })
    .select('id')
    .single();
  if (error) throw error;
  const accountId = (data as { id: string }).id;
  await admin
    .from('ctrader_connections')
    .update({ account_id: accountId })
    .eq('id', conn.id);
  return accountId;
}

async function upsertTrades(
  admin: Admin,
  accountId: string,
  rows: ImportedTradeRow[],
): Promise<number> {
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.external_id);
  const { data: existing } = await admin
    .from('trades')
    .select('external_id')
    .eq('account_id', accountId)
    .in('external_id', ids);
  const have = new Set(
    ((existing ?? []) as { external_id: string }[]).map((e) => e.external_id),
  );
  const toInsert = rows.filter((r) => !have.has(r.external_id));
  if (toInsert.length) {
    const { error } = await admin.from('trades').insert(toInsert);
    if (error) throw error;
  }
  return toInsert.length;
}

export type CtraderSyncResult = {
  connected: boolean;
  accounts?: Array<{ login: number; label: string; imported: number; total: number }>;
};

/** Discover and sync every cTrader account for a user. */
export async function syncCtraderForUser(
  admin: Admin,
  userId: string,
): Promise<CtraderSyncResult> {
  const { data: oauthRow } = await admin
    .from('ctrader_oauth')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  const oauth = oauthRow as {
    access_token: string;
    refresh_token: string;
    token_expires_at: string;
  } | null;
  if (!oauth) return { connected: false };

  let accessToken = oauth.access_token;
  if (new Date(oauth.token_expires_at).getTime() < Date.now() + 60_000) {
    const t = await refreshCtraderToken(oauth.refresh_token);
    accessToken = t.accessToken;
    await admin
      .from('ctrader_oauth')
      .update({
        access_token: t.accessToken,
        refresh_token: t.refreshToken,
        token_expires_at: new Date(Date.now() + t.expiresInSec * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  }

  const clientId = process.env.CTRADER_CLIENT_ID ?? '';
  const clientSecret = process.env.CTRADER_CLIENT_SECRET ?? '';
  const sessions: Record<CtraderEnv, CtraderSession | null> = {
    live: null,
    demo: null,
  };
  const sessionFor = async (env: CtraderEnv): Promise<CtraderSession> => {
    const existing = sessions[env];
    if (existing) return existing;
    const s = new CtraderSession(env);
    await s.connect();
    await s.appAuth(clientId, clientSecret);
    sessions[env] = s;
    return s;
  };

  const out: NonNullable<CtraderSyncResult['accounts']> = [];
  try {
    // The account list is app+token level, available on either host.
    const disc = await sessionFor('demo');
    const accounts = await disc.getAccounts(accessToken);

    for (const acc of accounts) {
      const env: CtraderEnv = acc.isLive ? 'live' : 'demo';
      const label = `${acc.brokerTitleShort || 'cTrader'} ${acc.traderLogin}`.trim();
      const { data: connRow, error: connErr } = await admin
        .from('ctrader_connections')
        .upsert(
          {
            user_id: userId,
            ctid_trader_account_id: acc.ctidTraderAccountId,
            environment: env,
            label,
            state: 'connected',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,ctid_trader_account_id' },
        )
        .select('id, account_id')
        .single();
      if (connErr) throw connErr;
      const conn = connRow as { id: string; account_id: string | null };

      const s = await sessionFor(env);
      await s.accountAuth(acc.ctidTraderAccountId, accessToken);
      const symbols = await s.getSymbols(acc.ctidTraderAccountId);
      const deals = await s.getDeals(acc.ctidTraderAccountId, 0, Date.now(), 1000);
      const rows = pairCtraderDeals(deals, symbols, userId);

      // Detect deposit currency + initial balance only when creating the account
      // (never clobber a user's own edits on an already-linked account). Starting
      // balance is the current balance backed out by realized P&L.
      let meta = { currency: 'USD', startingBalance: 0 };
      if (!conn.account_id) {
        const sumNet = rows.reduce((sum, r) => sum + r.net_pnl, 0);
        const trader = await s.getTrader(acc.ctidTraderAccountId);
        const assets = await s.getAssets(acc.ctidTraderAccountId);
        const balance = trader.balance / Math.pow(10, trader.moneyDigits || 2);
        meta = {
          currency: assets.get(trader.depositAssetId) || 'USD',
          startingBalance: round2(balance - sumNet),
        };
      }

      const accountId = await ensureAccount(admin, userId, conn, acc, meta);
      for (const r of rows) r.account_id = accountId;
      const imported = await upsertTrades(admin, accountId, rows);

      await admin
        .from('ctrader_connections')
        .update({
          last_synced_at: new Date().toISOString(),
          state: 'connected',
          last_error: null,
        })
        .eq('id', conn.id);

      out.push({ login: acc.traderLogin, label, imported, total: rows.length });
    }
  } finally {
    for (const s of Object.values(sessions)) s?.close();
  }

  return { connected: true, accounts: out };
}
