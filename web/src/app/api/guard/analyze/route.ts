import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { getServerEntitlements } from '@/src/lib/billing/server';
import { AI_MODEL, isAiConfigured } from '@/src/lib/ai/client';
import { isOverDailyCap, logUsage, monthlyUsageCount } from '@/src/lib/ai/usage';
import { narrateGuard } from '@/src/lib/ai/guard';
import type { GuardContext } from '@/src/lib/analytics/tradeGuard';
import { median } from '@/src/lib/analytics/hindsight';
import {
  fetchHighImpactEvents,
} from '@/src/lib/integrations/forexFactory';
import {
  evaluateNewsWindow,
  newsWindowMessage,
  type NewsRule,
} from '@/src/lib/analytics/newsRule';
import {
  getAccountStatus,
  deployAccount,
  undeployAccount,
  waitUntilConnected,
  fetchOpenPositions,
  fetchSymbolPrice,
  fetchTickSize,
  fetchCandles,
  fetchAccountInformation,
  DEFAULT_MT_REGION,
} from '@/src/lib/integrations/metaapi';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/guard/analyze
//
// Body: { connectionId?, positionId?, newsRule? }
//
// On-demand Live Guard: deploy-on-demand, read one live open position plus the
// market/account context around it, run the analyzer, and narrate it with AI.
// Metered like any other AI action. (The always-on worker will later do this the
// instant a trade opens; this route proves the brain against a real account.)

function parseNewsRule(v: unknown): NewsRule {
  const r = (v ?? {}) as Partial<NewsRule> & { penalty?: unknown };
  const pen = (r.penalty ?? {}) as { kind?: unknown; haircutPct?: unknown };
  const kind =
    pen.kind === 'void_trade' ||
    pen.kind === 'lose_all_profit' ||
    pen.kind === 'profit_haircut'
      ? pen.kind
      : 'breach';
  return {
    enabled: r.enabled === true,
    minutesBefore: Number.isFinite(r.minutesBefore) ? Number(r.minutesBefore) : 5,
    minutesAfter: Number.isFinite(r.minutesAfter) ? Number(r.minutesAfter) : 5,
    penalty: {
      kind,
      haircutPct:
        typeof pen.haircutPct === 'number' ? pen.haircutPct : null,
    },
  };
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitlements = await getServerEntitlements(sb);
  if (!entitlements.features.ai) {
    return NextResponse.json(
      { error: 'Foresight requires an active plan.', code: 'upgrade_required' },
      { status: 403 },
    );
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: 'AI is not configured yet.' },
      { status: 503 },
    );
  }
  if (await isOverDailyCap(sb, user.id)) {
    return NextResponse.json(
      { error: 'You have reached your daily AI limit. Try again tomorrow.' },
      { status: 429 },
    );
  }
  if (
    (await monthlyUsageCount(sb, user.id)) >=
    entitlements.limits.aiActionsPerMonth
  ) {
    return NextResponse.json(
      {
        error: `You have used all ${entitlements.limits.aiActionsPerMonth} AI actions this month.`,
        code: 'quota_reached',
      },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    connectionId?: unknown;
    accountId?: unknown;
    positionId?: unknown;
    newsRule?: unknown;
    wake?: unknown;
  };
  // Opt-in: briefly deploy a cold account to read a live position (a test
  // affordance). Default stays read-only, so it never deploys on its own.
  const wantWake = body.wake === true;
  const connectionId =
    typeof body.connectionId === 'string' ? body.connectionId : null;
  const accountId =
    typeof body.accountId === 'string' && body.accountId !== 'all'
      ? body.accountId
      : null;
  const wantPositionId =
    typeof body.positionId === 'string' ? body.positionId : null;
  const bodyNewsRule =
    body.newsRule != null ? parseNewsRule(body.newsRule) : null;

  // Resolve a connected MetaTrader account (RLS-scoped). Skip dead ones.
  let q = sb
    .from('mt_connections')
    .select('id, account_id, metaapi_account_id, region, state')
    .eq('user_id', user.id)
    .neq('state', 'breached')
    .neq('state', 'over_limit');
  if (connectionId) q = q.eq('id', connectionId);
  else if (accountId) q = q.eq('account_id', accountId);
  const { data: conns } = await q.order('created_at', { ascending: true });
  const conn = (conns ?? [])[0] as
    | {
        id: string;
        account_id: string;
        metaapi_account_id: string;
        region: string | null;
      }
    | undefined;
  if (!conn) {
    return NextResponse.json(
      { error: 'Connect a MetaTrader account first.' },
      { status: 404 },
    );
  }
  const region = conn.region ?? DEFAULT_MT_REGION;

  let undeployAfter = false;
  try {
    // Default is READ-ONLY on deployment (never deploys, so it can never change
    // an account's state or leave it billing). With { wake: true } the user opts
    // into a one-off test that briefly deploys a cold account to read a live
    // position, then undeploys it.
    const status = await getAccountStatus(conn.metaapi_account_id);
    const live =
      status.state === 'DEPLOYED' && status.connectionStatus === 'CONNECTED';
    if (!live) {
      if (!wantWake) {
        return NextResponse.json(
          {
            error:
              'This account is not live right now, so there is no open position to read. Foresight runs continuously on the accounts you enable it for; this on-demand check only works while the account is actively connected.',
            code: 'not_live',
          },
          { status: 409 },
        );
      }
      if (status.state !== 'DEPLOYED' && status.state !== 'DEPLOYING') {
        await deployAccount(conn.metaapi_account_id);
      }
      const ok = await waitUntilConnected(conn.metaapi_account_id, {
        timeoutMs: 35_000,
      });
      if (!ok) {
        // Leave it deployed so it keeps connecting; the retry finds it live.
        return NextResponse.json(
          {
            error:
              'Waking your account. The first connect can take a minute; it stays warming up, so tap Wake and analyze again shortly.',
            code: 'warming_up',
          },
          { status: 409 },
        );
      }
      // A woken (non-guarded) account is undeployed again once we have read it.
      undeployAfter = true;
    }

    const positions = await fetchOpenPositions(conn.metaapi_account_id, region);
    if (!positions.length) {
      return NextResponse.json(
        { error: 'No open positions on this account right now.' },
        { status: 404 },
      );
    }
    const pos =
      (wantPositionId && positions.find((p) => p.id === wantPositionId)) ||
      positions[0];

    // Market + account context (each best-effort).
    const [price, tickSize, candles, info] = await Promise.all([
      fetchSymbolPrice(conn.metaapi_account_id, region, pos.symbol),
      fetchTickSize(conn.metaapi_account_id, region, pos.symbol),
      fetchCandles(conn.metaapi_account_id, region, pos.symbol),
      fetchAccountInformation(conn.metaapi_account_id, region),
    ]);

    const spreadNow =
      price?.ask != null && price?.bid != null ? price.ask - price.bid : null;

    // Money at risk to the stop, if we have the pieces.
    let riskMoney: number | null = null;
    if (
      pos.stopLoss != null &&
      tickSize &&
      tickSize > 0 &&
      price?.lossTickValue != null
    ) {
      const ticks = Math.abs(pos.openPrice - pos.stopLoss) / tickSize;
      riskMoney = ticks * price.lossTickValue * pos.volume;
    }

    // Their per-trade risk rule (from the profile) and behavioural context.
    const { data: profile } = await sb
      .from('profiles')
      .select('risk_per_trade_percent')
      .eq('id', user.id)
      .maybeSingle();
    const riskRulePct =
      typeof (profile as { risk_per_trade_percent?: number } | null)
        ?.risk_per_trade_percent === 'number'
        ? (profile as { risk_per_trade_percent: number }).risk_per_trade_percent
        : null;

    const { data: recentTrades } = await sb
      .from('trades')
      .select('outcome, closed_at, volume')
      .eq('account_id', conn.account_id)
      .order('closed_at', { ascending: false })
      .limit(60);
    const trades = (recentTrades ?? []) as Array<{
      outcome: string;
      closed_at: string | null;
      volume: number | null;
    }>;
    const lastLoss = trades.find((t) => t.outcome === 'LOSS' && t.closed_at);
    const minutesSinceLastLoss = lastLoss?.closed_at
      ? Math.max(
          0,
          (Date.now() - new Date(lastLoss.closed_at).getTime()) / 60_000,
        )
      : null;
    const vols = trades
      .map((t) => (typeof t.volume === 'number' ? t.volume : null))
      .filter((v): v is number => v != null && v > 0);
    const medianVolumeLots = vols.length ? median(vols) : null;

    // News rule: an explicit body rule (test override) wins, else the account's
    // saved prop news rule.
    const { data: acctRow } = await sb
      .from('accounts')
      .select('prop_rules')
      .eq('id', conn.account_id)
      .maybeSingle();
    const savedNews = (acctRow?.prop_rules as { news?: unknown } | null)?.news;
    const newsRule = bodyNewsRule ?? parseNewsRule(savedNews);

    // Prop news window (only if a rule is enabled).
    let news: GuardContext['news'] = null;
    if (newsRule.enabled) {
      const events = await fetchHighImpactEvents();
      const win = evaluateNewsWindow({
        now: Date.now(),
        pair: pos.symbol,
        events,
        rule: newsRule,
      });
      news = { state: win.state, message: newsWindowMessage(win, newsRule) };
    }

    const ctx: GuardContext = {
      symbol: pos.symbol,
      side: pos.side,
      entry: pos.openPrice,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      volumeLots: pos.volume,
      balance: info?.balance ?? null,
      currency: info?.currency ?? 'USD',
      riskMoney,
      riskRulePct,
      candles,
      spreadNow,
      spreadAvg: null, // a rolling spread average lands with the worker
      news,
      minutesSinceLastLoss,
      medianVolumeLots,
    };

    const { signals, summary, usage } = await narrateGuard(ctx);
    await logUsage(sb, user.id, 'guard', AI_MODEL, usage);

    return NextResponse.json({
      position: {
        id: pos.id,
        symbol: pos.symbol,
        side: pos.side,
        entry: pos.openPrice,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        volume: pos.volume,
      },
      signals,
      summary,
      model: AI_MODEL,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Foresight failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    // Undeploy a test-woken account once we are done. The warming-up early
    // return above leaves it deployed on purpose (undeployAfter is still false
    // there), so the retry finds it connected.
    if (undeployAfter) {
      try {
        await undeployAccount(conn.metaapi_account_id);
      } catch {
        // best-effort
      }
    }
  }
}
