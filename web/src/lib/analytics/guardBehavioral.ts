// The broker-agnostic half of the Live Guard read. Everything here is computed
// from the trader's own data (their account, trades, balance events, committed
// rules) plus the news calendar, so it is identical whether the position came
// from MetaTrader or cTrader. The technical half (live candles, spread, dollar
// risk to the stop) is broker-specific and supplied by the caller.

import type { SupabaseClient } from '@supabase/supabase-js';
import { median, sessionOf, WEEKDAYS } from '@/src/lib/analytics/hindsight';
import { ruleStatement, type RuleKind } from '@/src/lib/analytics/commitment';
import { computePropStatus, type PropRules } from '@/src/lib/analytics/propFirm';
import {
  fetchHighImpactEvents,
  currenciesForPair,
} from '@/src/lib/integrations/forexFactory';
import {
  evaluateNewsWindow,
  newsWindowMessage,
  type NewsRule,
} from '@/src/lib/analytics/newsRule';
import type { GuardContext, GuardSide } from '@/src/lib/analytics/tradeGuard';

export type BehavioralGuardContext = {
  riskRulePct: number | null;
  minutesSinceLastLoss: number | null;
  medianVolumeLots: number | null;
  committedRuleHits: string[];
  propBuffer: GuardContext['propBuffer'];
  pairStats: GuardContext['pairStats'];
  session: GuardContext['session'];
  news: GuardContext['news'];
};

/** Normalize a stored/overridden prop news rule into a complete NewsRule. */
export function parseNewsRule(v: unknown): NewsRule {
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
      haircutPct: typeof pen.haircutPct === 'number' ? pen.haircutPct : null,
    },
  };
}

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

/** Build the behavioral + news context around an open position. */
export async function buildBehavioralGuardContext(
  sb: SupabaseClient,
  input: {
    userId: string;
    accountId: string;
    symbol: string;
    volumeLots: number;
    /** Explicit news rule override (test panel); else the account's saved rule. */
    newsRuleOverride?: NewsRule | null;
  },
): Promise<BehavioralGuardContext> {
  const symbol = input.symbol.toUpperCase();

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
      .eq('id', input.userId)
      .maybeSingle(),
    sb
      .from('accounts')
      .select('starting_balance, prop_rules')
      .eq('id', input.accountId)
      .maybeSingle(),
    sb
      .from('trades')
      .select(
        'opened_at, closed_at, outcome, instrument, volume, net_pnl, pnl_amount, commission',
      )
      .eq('account_id', input.accountId)
      .order('opened_at', { ascending: false })
      .limit(300),
    sb
      .from('account_balance_events')
      .select('kind, amount, occurred_at')
      .eq('account_id', input.accountId),
    sb
      .from('trading_rules')
      .select('kind, subject, label')
      .eq('status', 'active')
      .eq('user_id', input.userId),
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
  // "Usual size" must be SAME-INSTRUMENT: lots aren't comparable across markets
  // (7 lots of CADJPY is nothing like 7 lots of BTCUSD), so a cross-instrument
  // median yields a nonsense "Nx your usual size". Require a few same-symbol
  // trades, else null so the oversizing read simply doesn't fire.
  const vols = rows
    .filter((t) => (t.instrument ?? '').toUpperCase() === symbol)
    .map((t) => (typeof t.volume === 'number' ? t.volume : null))
    .filter((v): v is number => v != null && v > 0);
  const medianVolumeLots = vols.length >= 4 ? median(vols) : null;

  // Their record on this exact pair.
  const pairRows = rows.filter(
    (t) => (t.instrument ?? '').toUpperCase() === symbol,
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
        input.volumeLots >= medianVolumeLots * 1.5;
    else if (r.kind === 'session')
      hit = !!r.subject && currentSession === r.subject;
    else if (r.kind === 'weekday')
      hit = !!r.subject && WEEKDAYS[new Date().getUTCDay()] === r.subject;
    if (hit)
      committedRuleHits.push(
        r.label || ruleStatement(r.kind as RuleKind, r.subject),
      );
  }

  // News: nearest high-impact event for the pair within the horizon, plus the
  // prop news-rule blackout when a rule is set. Skipped only when the calendar
  // feed is unreachable, so we never falsely claim calm.
  const savedNews = (propRules as { news?: unknown } | null)?.news;
  const newsRule = input.newsRuleOverride ?? parseNewsRule(savedNews);
  let news: GuardContext['news'] = null;
  const events = await fetchHighImpactEvents();
  if (events.length > 0) {
    const currencies = currenciesForPair(symbol);
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
        pair: symbol,
        events,
        rule: newsRule,
      });
      ruleState = win.state;
      ruleMessage = newsWindowMessage(win, newsRule);
    }

    news = { ruleState, ruleMessage, nextEvent, horizonHours, currencies };
  }

  return {
    riskRulePct,
    minutesSinceLastLoss,
    medianVolumeLots,
    committedRuleHits,
    propBuffer,
    pairStats,
    session,
    news,
  };
}

/** Re-export for callers that build the unguarded side themselves. */
export type { GuardSide };
