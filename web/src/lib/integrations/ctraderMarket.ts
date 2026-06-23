// On-demand cTrader candles for the pre-trade check. Unlike MetaApi there is no
// deploy/wake cost here: the Open API is a free short-lived TLS socket, so we
// open one, auth, pull trendbars for the planned symbol across the Foresight
// timeframes, and close. Returns [] on any miss (no connection, token, symbol,
// or data) so the caller degrades to the behavioural read.

import type { SupabaseClient } from '@supabase/supabase-js';
import { refreshCtraderToken } from '@/src/lib/integrations/ctrader';
import { CtraderSession, type CtraderEnv } from '@/src/lib/integrations/ctraderSocket';
import { ctraderTimeframes, type Tf } from '@/src/lib/analytics/timeframes';
import type { GuardTimeframe } from '@/src/lib/analytics/tradeGuard';

// cTrader ProtoOATrendbarPeriod id -> minutes, so we can size the from/to window.
const PERIOD_MINUTES: Record<number, number> = {
  1: 1,
  5: 5,
  7: 15,
  8: 30,
  9: 60,
  10: 240,
  12: 1440,
};

export type CtraderMarketRead = {
  timeframes: GuardTimeframe[];
  pipSize: number | null;
};

const EMPTY: CtraderMarketRead = { timeframes: [], pipSize: null };

export async function fetchCtraderTimeframes(
  sb: SupabaseClient,
  userId: string,
  accountId: string,
  symbol: string,
  analyzedTf: Tf | null,
): Promise<CtraderMarketRead> {
  const { data: connRow } = await sb
    .from('ctrader_connections')
    .select('ctid_trader_account_id, environment')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!connRow) return EMPTY;
  const conn = connRow as {
    ctid_trader_account_id: number;
    environment?: string | null;
  };
  const ctid = Number(conn.ctid_trader_account_id);
  const env: CtraderEnv = conn.environment === 'live' ? 'live' : 'demo';

  const { data: oauthRow } = await sb
    .from('ctrader_oauth')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!oauthRow) return EMPTY;
  const oauth = oauthRow as {
    access_token: string;
    refresh_token: string;
    token_expires_at: string | null;
  };

  // Refresh the access token if it is expired or about to be, like the sync.
  let accessToken = oauth.access_token;
  const expMs = oauth.token_expires_at
    ? new Date(oauth.token_expires_at).getTime()
    : 0;
  if (!expMs || expMs < Date.now() + 60_000) {
    try {
      const t = await refreshCtraderToken(oauth.refresh_token);
      accessToken = t.accessToken;
      await sb
        .from('ctrader_oauth')
        .update({
          access_token: t.accessToken,
          refresh_token: t.refreshToken,
          token_expires_at: new Date(Date.now() + t.expiresInSec * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } catch {
      // Fall through with the stored token; auth below may still succeed.
    }
  }

  const clientId = process.env.CTRADER_CLIENT_ID ?? '';
  const clientSecret = process.env.CTRADER_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) return EMPTY;

  const session = new CtraderSession(env);
  try {
    await session.connect();
    await session.appAuth(clientId, clientSecret);
    await session.accountAuth(ctid, accessToken);

    // Symbol name -> id. getSymbols already strips '/' and upper-cases names.
    const symbols = await session.getSymbols(ctid);
    const want = symbol.replace('/', '').toUpperCase();
    let symbolId: number | null = null;
    for (const [id, name] of symbols) {
      if (name === want) {
        symbolId = id;
        break;
      }
    }
    if (symbolId == null) {
      for (const [id, name] of symbols) {
        if (name.startsWith(want) || want.startsWith(name)) {
          symbolId = id;
          break;
        }
      }
    }
    if (symbolId == null) return EMPTY;

    // Pip size for the ATR-in-pips and round-number reads (best-effort).
    let pipSize: number | null = null;
    try {
      pipSize = await session.getSymbolPipSize(ctid, symbolId);
    } catch {
      // leave null; trend + structure + R:R still work without it
    }

    const tfs = ctraderTimeframes(analyzedTf);
    const now = Date.now();
    const out: GuardTimeframe[] = [];
    for (const t of tfs) {
      const minutes = PERIOD_MINUTES[t.period] ?? 60;
      const fromMs = now - Math.round(120 * minutes * 60_000 * 1.6);
      try {
        const candles = await session.getTrendbars(
          ctid,
          symbolId,
          t.period,
          fromMs,
          now,
        );
        if (candles.length >= 6) out.push({ tf: t.label, candles });
      } catch {
        // Skip this timeframe; the others may still come back.
      }
    }
    return { timeframes: out, pipSize };
  } catch {
    return EMPTY;
  } finally {
    session.close();
  }
}
