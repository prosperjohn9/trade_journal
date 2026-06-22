import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { refreshCtraderToken } from '@/src/lib/integrations/ctrader';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';
import { adminUserIdSet } from '@/src/lib/auth/admin';
import { ctraderTimeframes, isTf } from '@/src/lib/analytics/timeframes';

export const runtime = 'nodejs';

// GET /api/guard/ctrader/accounts  (worker-only)
//
// The always-on worker calls this to learn which cTrader accounts have Foresight
// enabled and should be watched over the Open API socket. Unlike MetaTrader,
// cTrader has no per-account hosting cost, so there is NO paid seat cap: Foresight
// is free on cTrader, included with any active plan. We still gate on an entitled
// subscription (admins always included) so the worker only spends AI on customers.
//
// Returns, per account, what the worker needs to auth a socket and read it: the
// ctid, environment (live/demo host), and a fresh access token. The worker holds
// the app's client id/secret in its own env; tokens never reach the browser.

type Conn = {
  id: string;
  account_id: string;
  ctid_trader_account_id: number | string;
  environment: string | null;
  state: string | null;
  user_id: string;
  created_at: string | null;
  guard_analyzed_tf: string | null;
};

export async function GET(request: Request) {
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret || request.headers.get('x-worker-secret') !== workerSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('ctrader_connections')
    .select(
      'id, account_id, ctid_trader_account_id, environment, state, user_id, created_at, guard_analyzed_tf',
    )
    .eq('guard_enabled', true)
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dead = new Set(['breached', 'over_limit']);
  const live = ((data ?? []) as Conn[]).filter((c) => !dead.has(c.state ?? ''));
  if (!live.length) return NextResponse.json({ accounts: [] });

  // Entitlement gate (admins always in). Free on cTrader, but only for customers.
  const userIds = [...new Set(live.map((c) => c.user_id))];
  const entitled = new Set<string>(await adminUserIdSet(sb));
  const { data: subs } = await sb
    .from('subscriptions')
    .select(`user_id, ${SUBSCRIPTION_SELECT}`)
    .in('user_id', userIds);
  for (const s of (subs ?? []) as Array<SubscriptionRow & { user_id: string }>) {
    if (resolveEntitlements(s).entitled) entitled.add(s.user_id);
  }

  // One fresh access token per owner (refresh when within a day of expiry).
  const tokenByUser = new Map<string, string | null>();
  const guardedUsers = [...new Set(live.filter((c) => entitled.has(c.user_id)).map((c) => c.user_id))];
  for (const uid of guardedUsers) {
    const { data: oauthRow } = await sb
      .from('ctrader_oauth')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', uid)
      .maybeSingle();
    const oauth = oauthRow as {
      access_token: string;
      refresh_token: string;
      token_expires_at: string;
    } | null;
    if (!oauth) {
      tokenByUser.set(uid, null);
      continue;
    }
    let token = oauth.access_token;
    if (new Date(oauth.token_expires_at).getTime() < Date.now() + 86_400_000) {
      try {
        const t = await refreshCtraderToken(oauth.refresh_token);
        token = t.accessToken;
        await sb
          .from('ctrader_oauth')
          .update({
            access_token: t.accessToken,
            refresh_token: t.refreshToken,
            token_expires_at: new Date(
              Date.now() + t.expiresInSec * 1000,
            ).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', uid);
      } catch {
        // Keep the existing token; the worker will surface an auth error if stale.
      }
    }
    tokenByUser.set(uid, token);
  }

  const accounts = live
    .filter((c) => entitled.has(c.user_id) && tokenByUser.get(c.user_id))
    .map((c) => ({
      connectionId: c.id,
      accountId: c.account_id,
      ctidTraderAccountId: Number(c.ctid_trader_account_id),
      environment: c.environment === 'live' ? 'live' : 'demo',
      userId: c.user_id,
      accessToken: tokenByUser.get(c.user_id) as string,
      // The trader's real timeframes (analysis + higher context), resolved to
      // cTrader trendbar periods, so the worker reads what they read.
      timeframes: ctraderTimeframes(
        isTf(c.guard_analyzed_tf) ? c.guard_analyzed_tf : null,
      ),
    }));

  return NextResponse.json({ accounts });
}
