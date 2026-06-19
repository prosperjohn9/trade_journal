import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { getServerEntitlements } from '@/src/lib/billing/server';
import { AI_MODEL, isAiConfigured } from '@/src/lib/ai/client';
import { isOverDailyCap, logUsage, monthlyUsageCount } from '@/src/lib/ai/usage';
import { narrateGuard } from '@/src/lib/ai/guard';
import { flagHeadline, type GuardContext } from '@/src/lib/analytics/tradeGuard';
import {
  analysisTimeframes,
  isTf,
  tfLabel,
  type Tf,
} from '@/src/lib/analytics/timeframes';
import { median, sessionOf, WEEKDAYS } from '@/src/lib/analytics/hindsight';
import { ruleStatement, type RuleKind } from '@/src/lib/analytics/commitment';
import {
  computePropStatus,
  type PropRules,
} from '@/src/lib/analytics/propFirm';
import {
  fetchHighImpactEvents,
  currenciesForPair,
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
import { sendTelegram } from '@/src/lib/integrations/telegram';

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
  // Two auth modes: a trusted worker (shared WORKER_SECRET; operates on behalf
  // of a connection's owner, no quota gates) or a logged-in user (token + RLS +
  // entitlement/quota gates).
  const workerSecret = process.env.WORKER_SECRET;
  const isWorker =
    !!workerSecret && request.headers.get('x-worker-secret') === workerSecret;

  let sb: SupabaseClient;
  let userId = '';

  if (isWorker) {
    sb = createServiceClient();
  } else {
    const token = getToken(request);
    if (!token)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    sb = createSupabaseWithToken(token);
    const {
      data: { user },
      error: authErr,
    } = await sb.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    const entitlements = await getServerEntitlements(sb);
    if (!entitlements.features.ai) {
      return NextResponse.json(
        { error: 'Foresight requires an active plan.', code: 'upgrade_required' },
        { status: 403 },
      );
    }
    if (await isOverDailyCap(sb, userId)) {
      return NextResponse.json(
        { error: 'You have reached your daily AI limit. Try again tomorrow.' },
        { status: 429 },
      );
    }
    if (
      (await monthlyUsageCount(sb, userId)) >=
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
  }

  if (!isAiConfigured()) {
    return NextResponse.json({ error: 'AI is not configured yet.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    connectionId?: unknown;
    accountId?: unknown;
    positionId?: unknown;
    newsRule?: unknown;
    wake?: unknown;
    analyzedTf?: unknown;
    executedTf?: unknown;
    setupId?: unknown;
    trigger?: unknown;
  };
  // What prompted this read. The worker sets 'open' the instant a trade opens and
  // 'modify' when the trader moves a stop or target; both tailor the alert's lead
  // line. A user-initiated read is just 'manual'.
  const trigger: 'open' | 'modify' | 'manual' =
    body.trigger === 'open' || body.trigger === 'modify'
      ? body.trigger
      : 'manual';
  const analyzedTf: Tf | null = isTf(body.analyzedTf) ? body.analyzedTf : null;
  const executedTf: Tf | null = isTf(body.executedTf) ? body.executedTf : null;
  const setupId = typeof body.setupId === 'string' ? body.setupId : null;
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

  // A worker call must name the account; a user call is scoped by RLS / user id.
  if (isWorker && !connectionId && !accountId) {
    return NextResponse.json(
      { error: 'accountId or connectionId is required.' },
      { status: 400 },
    );
  }

  // Resolve a connected MetaTrader account. Filter the dead states in JS so a
  // NULL state is kept (a Postgres .neq would silently drop it).
  let q = sb
    .from('mt_connections')
    .select('id, account_id, metaapi_account_id, region, state, user_id');
  if (!isWorker) q = q.eq('user_id', userId);
  if (connectionId) q = q.eq('id', connectionId);
  else if (accountId) q = q.eq('account_id', accountId);
  const { data: rawConns } = await q.order('created_at', { ascending: true });
  const dead = new Set(['breached', 'over_limit']);
  const conn = ((rawConns ?? []) as Array<{
    id: string;
    account_id: string;
    metaapi_account_id: string;
    region: string | null;
    state: string | null;
    user_id: string;
  }>).find((c) => !dead.has(c.state ?? ''));
  if (!conn) {
    return NextResponse.json(
      { error: 'Connect a MetaTrader account first.' },
      { status: 404 },
    );
  }
  // In worker mode we now know the owner; the rest scopes everything to them.
  if (isWorker) userId = conn.user_id;
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

    // Market + account context (each best-effort). The timeframes to read come
    // from what the trader analyzed on (plus a higher context), or the
    // day-trader default (1H + 4H).
    const tfs = analysisTimeframes(analyzedTf);
    const [price, tickSize, info] = await Promise.all([
      fetchSymbolPrice(conn.metaapi_account_id, region, pos.symbol),
      fetchTickSize(conn.metaapi_account_id, region, pos.symbol),
      fetchAccountInformation(conn.metaapi_account_id, region),
    ]);
    const candleResults = await Promise.all(
      tfs.map((t) =>
        fetchCandles(conn.metaapi_account_id, region, pos.symbol, t.code, 120),
      ),
    );
    const timeframes = tfs
      .map((t, i) => ({ tf: t.tf, candles: candleResults[i].candles }))
      .filter((t) => t.candles.length >= 6);
    const pipSize = tickSize && tickSize > 0 ? tickSize * 10 : null;

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

    // Profile risk rule, the account (starting balance + prop rules), its
    // trades, its balance events, and the user's committed rules.
    const [
      { data: profile },
      { data: acct },
      { data: tradeRows },
      { data: balanceRows },
      { data: ruleRows },
    ] = await Promise.all([
      sb
        .from('profiles')
        .select('risk_per_trade_percent')
        .eq('id', userId)
        .maybeSingle(),
      sb
        .from('accounts')
        .select('starting_balance, prop_rules')
        .eq('id', conn.account_id)
        .maybeSingle(),
      sb
        .from('trades')
        .select(
          'opened_at, closed_at, outcome, instrument, volume, net_pnl, pnl_amount, commission',
        )
        .eq('account_id', conn.account_id)
        .order('opened_at', { ascending: false })
        .limit(300),
      sb
        .from('account_balance_events')
        .select('kind, amount, occurred_at')
        .eq('account_id', conn.account_id),
      sb
        .from('trading_rules')
        .select('kind, subject, label')
        .eq('status', 'active')
        .eq('user_id', userId),
    ]);

    const riskRulePct =
      typeof (profile as { risk_per_trade_percent?: number } | null)
        ?.risk_per_trade_percent === 'number'
        ? (profile as { risk_per_trade_percent: number }).risk_per_trade_percent
        : null;
    const propRules =
      ((acct as { prop_rules?: unknown } | null)?.prop_rules as PropRules | null) ??
      null;
    const startingBalance = Number(
      (acct as { starting_balance?: number | null } | null)?.starting_balance ?? 0,
    );

    type TRow = {
      opened_at: string;
      closed_at: string | null;
      outcome: string;
      instrument: string | null;
      volume: number | null;
      net_pnl: number | null;
      pnl_amount: number | null;
      commission: number | null;
    };
    const rows = (tradeRows ?? []) as TRow[];
    const rowPnl = (t: TRow) =>
      t.net_pnl != null
        ? Number(t.net_pnl)
        : Number(t.pnl_amount ?? 0) - Number(t.commission ?? 0);

    // Behavioural: most recent loss + typical size.
    const lastLoss = rows
      .filter((t) => t.outcome === 'LOSS' && t.closed_at)
      .sort((a, b) => (a.closed_at! < b.closed_at! ? 1 : -1))[0];
    const minutesSinceLastLoss = lastLoss?.closed_at
      ? Math.max(0, (Date.now() - new Date(lastLoss.closed_at).getTime()) / 60_000)
      : null;
    const vols = rows
      .map((t) => (typeof t.volume === 'number' ? t.volume : null))
      .filter((v): v is number => v != null && v > 0);
    const medianVolumeLots = vols.length ? median(vols) : null;

    // Their record on this exact pair.
    const pairRows = rows.filter(
      (t) => (t.instrument ?? '').toUpperCase() === pos.symbol,
    );
    const pairStats =
      pairRows.length >= 5
        ? {
            trades: pairRows.length,
            winRatePct: Math.round(
              (pairRows.filter((t) => t.outcome === 'WIN').length /
                pairRows.length) *
                100,
            ),
          }
        : null;

    // Worst session by P&L, and whether now falls in it.
    const sessionPnl = new Map<string, number>();
    for (const t of rows) {
      if (!t.opened_at) continue;
      const s = sessionOf(t.opened_at);
      sessionPnl.set(s, (sessionPnl.get(s) ?? 0) + rowPnl(t));
    }
    let worst: string | null = null;
    let worstPnl = Infinity;
    for (const [s, p] of sessionPnl) {
      if (p < worstPnl) {
        worstPnl = p;
        worst = s;
      }
    }
    const currentSession = sessionOf(new Date().toISOString());
    const session = {
      current: currentSession,
      isWorst: rows.length >= 10 && currentSession === worst && worstPnl < 0,
    };

    // Prop drawdown buffer.
    let propBuffer: GuardContext['propBuffer'] = null;
    if (
      propRules &&
      (propRules.maxDrawdownPct != null || propRules.dailyLossPct != null)
    ) {
      const propTrades = rows
        .filter((t) => t.closed_at ?? t.opened_at)
        .map((t) => ({ at: t.closed_at ?? t.opened_at, pnl: rowPnl(t) }));
      const cashflows = (
        (balanceRows ?? []) as Array<{
          kind: string;
          amount: number;
          occurred_at: string;
        }>
      ).map((e) => ({
        at: e.occurred_at,
        amount: e.kind === 'DEPOSIT' ? Number(e.amount) : -Number(e.amount),
      }));
      const status = computePropStatus({
        startingBalance,
        rules: propRules,
        trades: propTrades,
        cashflows,
      });
      propBuffer = {
        dailyRemaining: status.dailyRemainingToday,
        overallRemaining: status.drawdownBufferAmount,
      };
    }

    // Committed rules this trade looks like it breaks.
    const committedRuleHits: string[] = [];
    for (const r of (ruleRows ?? []) as Array<{
      kind: string;
      subject: string | null;
      label: string | null;
    }>) {
      let hit = false;
      if (r.kind === 'revenge')
        hit = minutesSinceLastLoss != null && minutesSinceLastLoss < 60;
      else if (r.kind === 'oversized')
        hit =
          medianVolumeLots != null &&
          medianVolumeLots > 0 &&
          pos.volume >= medianVolumeLots * 1.5;
      else if (r.kind === 'session') hit = !!r.subject && currentSession === r.subject;
      else if (r.kind === 'weekday')
        hit = !!r.subject && WEEKDAYS[new Date().getUTCDay()] === r.subject;
      if (hit)
        committedRuleHits.push(r.label || ruleStatement(r.kind as RuleKind, r.subject));
    }

    // Open exposure across all positions.
    const others = positions.filter((p) => p.id !== pos.id);
    let exposure: GuardContext['exposure'] = null;
    if (others.length > 0) {
      const myCcys = new Set(currenciesForPair(pos.symbol));
      const shared = new Set<string>();
      for (const o of others) {
        for (const c of currenciesForPair(o.symbol)) if (myCcys.has(c)) shared.add(c);
      }
      let totalRisk = riskMoney ?? 0;
      let valued = riskMoney != null;
      const valuable = others.filter((o) => o.stopLoss != null).slice(0, 8);
      const specs = await Promise.all(
        valuable.map(async (o) => {
          const [p, ts] = await Promise.all([
            fetchSymbolPrice(conn.metaapi_account_id, region, o.symbol),
            fetchTickSize(conn.metaapi_account_id, region, o.symbol),
          ]);
          return { o, p, ts };
        }),
      );
      for (const { o, p, ts } of specs) {
        if (o.stopLoss != null && ts && ts > 0 && p?.lossTickValue != null) {
          totalRisk +=
            (Math.abs(o.openPrice - o.stopLoss) / ts) * p.lossTickValue * o.volume;
          valued = true;
        }
      }
      const bal = info?.balance ?? null;
      exposure = {
        others: others.length,
        sharedCurrencies: [...shared],
        totalRiskPct: valued && bal && bal > 0 ? (totalRisk / bal) * 100 : null,
      };
    }

    // News rule: an explicit body rule (test override) wins, else the account's
    // saved prop news rule (already loaded with the account above).
    const savedNews = (propRules as { news?: unknown } | null)?.news;
    const newsRule = bodyNewsRule ?? parseNewsRule(savedNews);

    // News context is ALWAYS included: the nearest high-impact event for the
    // pair (or explicit calm), plus the prop news-rule blackout when a rule is
    // set. Skipped only when the calendar feed is unreachable (empty), so we
    // never falsely claim calm.
    let news: GuardContext['news'] = null;
    const events = await fetchHighImpactEvents();
    if (events.length > 0) {
      const currencies = currenciesForPair(pos.symbol);
      const horizonHours = 4;
      const nowMs = Date.now();
      const upcoming = events
        .filter(
          (e) =>
            currencies.includes(e.currency) &&
            e.at > nowMs &&
            e.at - nowMs <= horizonHours * 3_600_000,
        )
        .sort((a, b) => a.at - b.at)[0];
      const nextEvent = upcoming
        ? {
            currency: upcoming.currency,
            title: upcoming.title,
            minutes: Math.round((upcoming.at - nowMs) / 60_000),
          }
        : null;

      let ruleState: 'clear' | 'approaching' | 'blackout' = 'clear';
      let ruleMessage: string | null = null;
      if (newsRule.enabled) {
        const win = evaluateNewsWindow({
          now: nowMs,
          pair: pos.symbol,
          events,
          rule: newsRule,
        });
        ruleState = win.state;
        ruleMessage = newsWindowMessage(win, newsRule);
      }

      news = { ruleState, ruleMessage, nextEvent, horizonHours, currencies };
    }

    // Optional tagged setup, for criteria context.
    let setup: { name: string; criteria: string[] } | null = null;
    if (setupId) {
      const { data: tpl } = await sb
        .from('setup_templates')
        .select('name')
        .eq('id', setupId)
        .maybeSingle();
      if (tpl) {
        const { data: items } = await sb
          .from('setup_template_items')
          .select('label, is_active')
          .eq('template_id', setupId)
          .order('sort_order', { ascending: true });
        setup = {
          name: (tpl as { name: string }).name,
          criteria: (
            (items ?? []) as Array<{ label: string; is_active: boolean }>
          )
            .filter((i) => i.is_active !== false)
            .map((i) => i.label),
        };
      }
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
      timeframes,
      pipSize,
      spreadNow,
      spreadAvg: null, // a rolling spread average lands with the worker
      news,
      minutesSinceLastLoss,
      medianVolumeLots,
      analyzedTf: analyzedTf ? tfLabel(analyzedTf) : null,
      executedTf: executedTf ? tfLabel(executedTf) : null,
      setup,
      exposure,
      committedRuleHits,
      propBuffer,
      pairStats,
      session,
    };

    const { signals, summary, usage } = await narrateGuard(ctx);
    await logUsage(sb, userId, 'guard', AI_MODEL, usage);

    const tldr = flagHeadline(signals);

    // Log the read (best-effort) so the trader can review it and the worker can
    // close the loop on outcome later.
    void sb
      .from('foresight_reads')
      .insert({
        user_id: userId,
        account_id: conn.account_id,
        position_id: pos.id,
        symbol: pos.symbol,
        side: pos.side,
        entry: pos.openPrice,
        stop_loss: pos.stopLoss,
        take_profit: pos.takeProfit,
        volume: pos.volume,
        warnings: signals.filter((s) => s.severity === 'warning').length,
        cautions: signals.filter((s) => s.severity === 'caution').length,
        tldr,
        summary,
        signals,
      })
      .then(
        () => {},
        () => {},
      );

    // Worker mode: push the read to the owner's Telegram the instant it lands.
    // Delivery lives here (not in the worker) so the bot token and chat id never
    // leave the app. Best-effort; a missing link just means no push.
    if (isWorker) {
      const { data: prof } = await sb
        .from('profiles')
        .select('telegram_chat_id')
        .eq('id', userId)
        .maybeSingle();
      const chatId = (prof as { telegram_chat_id?: string | null } | null)
        ?.telegram_chat_id;
      if (chatId) {
        const lead =
          trigger === 'modify'
            ? 'You changed the stop or target on this open trade.\n\n'
            : '';
        const head = `Foresight: ${pos.symbol} ${pos.side} ${pos.volume} lots`;
        const link =
          'See this and past reads: https://tradershindsight.com/foresight';
        const text = `${head}\n\n${lead}${tldr}\n\n${summary}\n\n${link}`;
        await sendTelegram(chatId, text);
      }
    }

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
      tldr,
      signals,
      summary,
      model: AI_MODEL,
      // Per-timeframe candle count + fetch status, to diagnose the candle feed.
      timeframesRead: tfs.map((t, i) => ({
        tf: t.tf,
        candles: candleResults[i].candles.length,
        status: candleResults[i].status,
      })),
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
