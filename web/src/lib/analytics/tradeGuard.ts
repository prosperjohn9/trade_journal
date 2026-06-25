// The Live Guard analyzer "brain". Given one open position plus the market and
// account context around it, it produces a list of GROUNDED signals: each one
// is computed from real data (the trade's own numbers, recent candles, the
// account, the news-rule engine, the trader's own leak history), never from a
// model's imagination. The AI layer only narrates these signals; it never
// invents them. Everything here is pure and offline-testable.
//
// Deliberately NOT here: order-flow / depth-of-market "liquidity pools". Retail
// FX/CFD has no consolidated order book, so claiming to see institutional
// liquidity would be fiction. What we CAN ground in price structure is OBSERVABLE
// chart structure: swing pivots that left a rejection wick, order blocks (the
// origin candle of an impulsive move), and fair-value gaps, each scored by
// FRESHNESS, a fresh/unmitigated level reacts hardest, while one tested 3+ times
// is weakening and more likely to break. See lib/analytics/structure.ts.

import {
  REVENGE_WINDOW_MS,
  OVERSIZE_FACTOR,
} from '@/src/lib/analytics/hindsight';
import {
  detectLevels,
  detectOrderBlocks,
  detectFvgs,
  type StructZone,
} from '@/src/lib/analytics/structure';

export type GuardSide = 'BUY' | 'SELL';

export type GuardCandle = { o: number; h: number; l: number; c: number };

export type GuardNews = {
  /** Rule-based status when a prop news rule is set; 'clear' otherwise. */
  ruleState: 'clear' | 'approaching' | 'blackout';
  /** Rule-based countdown/penalty message, when in or near a rule window. */
  ruleMessage: string | null;
  /** Nearest upcoming high-impact event for the pair within the horizon. */
  nextEvent: { currency: string; title: string; minutes: number } | null;
  /** How far ahead we looked, and which currencies we checked. */
  horizonHours: number;
  currencies: string[];
};

export type GuardTimeframe = { tf: string; candles: GuardCandle[] };

export type GuardContext = {
  symbol: string;
  side: GuardSide;
  entry: number;
  stopLoss: number | null;
  takeProfit: number | null;
  volumeLots: number;
  balance: number | null;
  currency: string;
  /** Money at risk to the stop, precomputed from the symbol spec by the caller. */
  riskMoney: number | null;
  /** Their max risk per trade (firm or committed rule), in percent. */
  riskRulePct: number | null;
  /** Recent candles per timeframe, primary first (e.g. 1H then 4H), oldest to
   *  newest. The first is used for structure/levels; all are used for trend. */
  timeframes: GuardTimeframe[];
  /** Price size of one pip, for expressing distances in pips. */
  pipSize: number | null;
  spreadNow: number | null;
  spreadAvg: number | null;
  news: GuardNews | null;
  /** Minutes since their last losing trade closed, if recent. */
  minutesSinceLastLoss: number | null;
  /** Their typical position size, for oversize detection. */
  medianVolumeLots: number | null;
  // Optional context the trader can supply (more context = sharper read).
  /** Timeframe they analyzed on; null means none given (day-trader default). */
  analyzedTf: string | null;
  /** Timeframe they executed on, for context only (not analyzed). */
  executedTf: string | null;
  /** A setup they tagged this trade with, and its checklist criteria. */
  setup: { name: string; criteria: string[] } | null;
  // Deeper context computed server-side (all optional, null when unavailable).
  /** Other open positions: count, currencies shared with this pair, combined
   *  risk if every stop hits. */
  exposure: {
    others: number;
    sharedCurrencies: string[];
    totalRiskPct: number | null;
  } | null;
  /** Labels of the trader's committed rules this trade looks like it breaks. */
  committedRuleHits: string[];
  /** Remaining prop drawdown room (money), to size this risk against. */
  propBuffer: {
    dailyRemaining: number | null;
    overallRemaining: number | null;
  } | null;
  /** Their record on this exact pair. */
  pairStats: { trades: number; winRatePct: number } | null;
  /** The current session and whether it is historically their worst. */
  session: { current: string; isWorst: boolean } | null;
};

export type GuardSeverity = 'info' | 'caution' | 'warning';

export type GuardSignal = {
  id: string;
  severity: GuardSeverity;
  title: string;
  detail: string;
};

function fmt(n: number): string {
  const a = Math.abs(n);
  const dp = a >= 100 ? 2 : a >= 1 ? 4 : 5;
  return n.toFixed(dp);
}

function money(n: number, ccy: string): string {
  const sym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
  const s = sym[ccy];
  const v = Math.abs(n).toFixed(2);
  return s ? `${s}${v}` : `${v} ${ccy}`;
}

function priceSpan(c: GuardCandle[]): number {
  if (!c.length) return 0;
  return Math.max(...c.map((x) => x.h)) - Math.min(...c.map((x) => x.l));
}

/** Crude but explainable trend: compare the recent half of closes to the older
 *  half, scaled by the candle range, so it is direction with a dead-band. */
export function trendOf(c: GuardCandle[]): 'up' | 'down' | 'flat' {
  if (c.length < 6) return 'flat';
  const closes = c.map((x) => x.c);
  const mid = Math.floor(closes.length / 2);
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const diff = avg(closes.slice(mid)) - avg(closes.slice(0, mid));
  const span = priceSpan(c);
  if (span <= 0) return 'flat';
  const pct = diff / span;
  if (pct > 0.1) return 'up';
  if (pct < -0.1) return 'down';
  return 'flat';
}

/** Structure read: order blocks, fair-value gaps and swing levels between price
 *  and the target (and at the stop), scored by FRESHNESS. A fresh opposing zone
 *  or untested level is a real obstacle; a level tested 3+ times is weakening and
 *  downgraded to a "speed bump", not a wall. A fresh ALIGNED zone at the entry is
 *  surfaced as a positive (a quality location). Tolerances are in ATR units. */
function levelSignals(ctx: GuardContext, candles: GuardCandle[]): GuardSignal[] {
  const out: GuardSignal[] = [];
  const a = atr(candles);
  if (!a || a <= 0) return out;
  const reach = a * 1.5; // "near enough to matter"
  const isBuy = ctx.side === 'BUY';
  const dir = isBuy ? 'long' : 'short';

  const levels = detectLevels(candles, a);
  const zones = [...detectOrderBlocks(candles, a), ...detectFvgs(candles, a)];

  const opposingKind = isBuy ? 'supply' : 'demand'; // blocks the way to target
  const aligningKind = isBuy ? 'demand' : 'supply'; // backs the entry
  const zoneLabel = (z: StructZone) => `${fmt(z.bottom)}-${fmt(z.top)}`;
  const zoneDist = (z: StructZone) =>
    isBuy ? z.bottom - ctx.entry : ctx.entry - z.top;
  const zoneInFront = (z: StructZone) =>
    ctx.takeProfit != null &&
    (isBuy
      ? z.bottom > ctx.entry && z.bottom < ctx.takeProfit
      : z.top < ctx.entry && z.top > ctx.takeProfit);

  // 1. Entry quality: entry sitting in a FRESH aligned zone is a good location.
  const entryZone = zones
    .filter(
      (z) =>
        z.kind === aligningKind &&
        !z.mitigated &&
        ctx.entry >= z.bottom - a * 0.3 &&
        ctx.entry <= z.top + a * 0.3,
    )
    .sort((x, y) => y.origin - x.origin)[0];
  if (entryZone) {
    out.push({
      id: 'entry-zone',
      severity: 'info',
      title: `Entry at a fresh ${aligningKind} zone`,
      detail: `Your entry sits in a fresh ${aligningKind} zone (${zoneLabel(entryZone)}) that price has not returned to since it formed, a high-quality location for a ${dir}.`,
    });
  }

  // 2/3. Structure between price and the target, by freshness.
  let coveredTp = false;
  if (ctx.takeProfit != null) {
    const freshZone = zones
      .filter(
        (z) =>
          z.kind === opposingKind &&
          !z.mitigated &&
          zoneInFront(z) &&
          zoneDist(z) > 0 &&
          zoneDist(z) <= reach,
      )
      .sort((x, y) => zoneDist(x) - zoneDist(y))[0];

    const oppSide = isBuy ? 'high' : 'low';
    const inFront = levels.filter(
      (l) =>
        l.side === oppSide &&
        (isBuy
          ? l.price > ctx.entry && l.price < ctx.takeProfit!
          : l.price < ctx.entry && l.price > ctx.takeProfit!) &&
        Math.abs(l.price - ctx.entry) <= reach,
    );
    const byNear = (x: { price: number }, y: { price: number }) =>
      Math.abs(x.price - ctx.entry) - Math.abs(y.price - ctx.entry);
    const freshLevel = inFront.filter((l) => l.touches <= 2).sort(byNear)[0];
    const tiredLevel = inFront.filter((l) => l.touches >= 3).sort(byNear)[0];

    if (freshZone) {
      coveredTp = true;
      out.push({
        id: 'tp-zone',
        severity: 'caution',
        title: 'Fresh zone in front of your target',
        detail: `A fresh ${opposingKind} zone (${zoneLabel(freshZone)}) sits between price and your target. Fresh zones are where price reacts hardest, so expect a stall or reversal there before your target.`,
      });
    } else if (freshLevel) {
      coveredTp = true;
      const touchTxt =
        freshLevel.touches === 1
          ? 'fresh (one clean rejection, not retested)'
          : 'only lightly tested';
      out.push({
        id: 'tp-level',
        severity: 'caution',
        title: 'Untested level in front of your target',
        detail: `A ${isBuy ? 'resistance' : 'support'} around ${fmt(freshLevel.price)} sits in your path and is ${touchTxt}. Fresh levels react hardest, so expect a reaction before your target.`,
      });
    } else if (tiredLevel) {
      coveredTp = true;
      out.push({
        id: 'tp-tired',
        severity: 'info',
        title: 'Weak level in front of your target',
        detail: `A ${isBuy ? 'resistance' : 'support'} around ${fmt(tiredLevel.price)} sits in your path but has been tested ${tiredLevel.touches} times. Repeatedly tested levels weaken and tend to break, so this is more a speed bump than a wall, often a continuation cue rather than an obstacle.`,
      });
    }
  }

  // Explicit clear-path read only when nothing is in the way.
  if (ctx.takeProfit != null && !coveredTp) {
    out.push({
      id: 'tp-clear',
      severity: 'info',
      title: 'Clear path to target',
      detail: `No fresh ${isBuy ? 'resistance' : 'support'} sits between price and your target on the structure I read.`,
    });
  }

  // 4. Stop parked just past a swing extreme (a wick / stop-run zone).
  if (ctx.stopLoss != null) {
    const extSide = isBuy ? 'low' : 'high';
    const ext = levels
      .filter(
        (l) =>
          l.side === extSide &&
          Math.abs(l.price - ctx.stopLoss!) <= reach &&
          (isBuy ? ctx.stopLoss! <= l.price : ctx.stopLoss! >= l.price),
      )
      .sort(
        (x, y) =>
          Math.abs(x.price - ctx.stopLoss!) -
          Math.abs(y.price - ctx.stopLoss!),
      )[0];
    if (ext) {
      out.push({
        id: 'sl-raid',
        severity: 'caution',
        title: 'Stop sits where price wicks',
        detail: `Your stop at ${fmt(ctx.stopLoss)} is just past a recent swing ${isBuy ? 'low' : 'high'} near ${fmt(ext.price)}, a spot price often wicks through to grab stops before continuing. A little more room dodges the wick.`,
      });
    }
  }

  return out;
}

function describeTrend(d: 'up' | 'down' | 'flat'): string {
  return d === 'up' ? 'trending up' : d === 'down' ? 'trending down' : 'ranging';
}

/** Average true range over the last `period` candles, in price units. */
export function atr(c: GuardCandle[], period = 14): number | null {
  if (c.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    trs.push(
      Math.max(
        c[i].h - c[i].l,
        Math.abs(c[i].h - c[i - 1].c),
        Math.abs(c[i].l - c[i - 1].c),
      ),
    );
  }
  const recent = trs.slice(-period);
  return recent.reduce((s, x) => s + x, 0) / recent.length;
}

/** Nearest 50-pip round level to a price, and how many pips away it sits. */
function nearestRound(
  price: number,
  pipSize: number,
): { level: number; pips: number } | null {
  if (!pipSize || pipSize <= 0) return null;
  const step = pipSize * 50;
  const level = Math.round(price / step) * step;
  return { level, pips: Math.abs(price - level) / pipSize };
}

/** Build the full read for a trade: always the core context (trend, R:R, risk,
 *  structure) plus any flags, ordered worst-first then in reading order. */
export function analyzeTrade(ctx: GuardContext): GuardSignal[] {
  const out: GuardSignal[] = [];
  const dir = ctx.side === 'BUY' ? 'long' : 'short';
  const primary =
    ctx.timeframes.find((t) => t.candles.length >= 6) ?? ctx.timeframes[0];

  // 1. Trend across timeframes (ALWAYS, with the timeframes I read).
  const reads = ctx.timeframes
    .filter((t) => t.candles.length >= 6)
    .map((t) => ({ tf: t.tf, dir: trendOf(t.candles) }));
  if (reads.length) {
    const primaryDir = reads[0].dir;
    const against =
      (ctx.side === 'BUY' && primaryDir === 'down') ||
      (ctx.side === 'SELL' && primaryDir === 'up');
    const withTrend =
      (ctx.side === 'BUY' && primaryDir === 'up') ||
      (ctx.side === 'SELL' && primaryDir === 'down');
    const phrase = reads.map((r) => `${r.tf} ${describeTrend(r.dir)}`).join(', ');
    out.push({
      id: 'trend',
      severity: against ? 'caution' : 'info',
      title: against
        ? 'Counter-trend entry'
        : withTrend
          ? 'With the trend'
          : 'Trend not clearly behind it',
      detail: against
        ? `You are ${dir}, but ${phrase}. Counter-trend entries need tighter management and usually a quicker exit.`
        : withTrend
          ? `You are ${dir} and ${phrase}, so this is with the trend.`
          : `You are ${dir}; ${phrase}. The trend is not clearly behind this, so treat it as a range play.`,
    });
  }

  // 2. Reward-to-risk (ALWAYS when SL+TP set), or a missing stop.
  if (ctx.stopLoss != null && ctx.takeProfit != null) {
    const rDist = Math.abs(ctx.entry - ctx.stopLoss);
    const tDist = Math.abs(ctx.takeProfit - ctx.entry);
    if (rDist > 0) {
      const rr = tDist / rDist;
      const pipTxt =
        ctx.pipSize && ctx.pipSize > 0
          ? ` Stop ${Math.round(rDist / ctx.pipSize)} pips, target ${Math.round(tDist / ctx.pipSize)} pips.`
          : '';
      const breakeven = Math.round((1 / (1 + rr)) * 100);
      out.push({
        id: 'rr',
        severity: rr < 0.8 ? 'warning' : rr < 1 ? 'caution' : 'info',
        title: `Reward-to-risk ${rr.toFixed(2)}R`,
        detail:
          rr < 1
            ? `You stand to make less than you are risking (${rr.toFixed(2)}R).${pipTxt} You would need to win about ${breakeven}% of trades just to break even at this ratio.`
            : `You are risking 1 to make ${rr.toFixed(2)}.${pipTxt} At this ratio you need to win more than ${breakeven}% of the time to come out ahead.`,
      });
    }
  } else if (ctx.stopLoss == null) {
    out.push({
      id: 'no-sl',
      severity: 'warning',
      title: 'No stop-loss set',
      detail:
        'This position has no stop. One fast move or news spike can run it well past any planned loss.',
    });
  }

  // 3. Risk size (ALWAYS when known).
  if (ctx.riskMoney != null && ctx.balance && ctx.balance > 0) {
    const pct = (ctx.riskMoney / ctx.balance) * 100;
    const sev: GuardSeverity =
      ctx.riskRulePct != null && pct > ctx.riskRulePct + 0.05
        ? 'warning'
        : pct >= 2
          ? 'caution'
          : 'info';
    const ruleTail =
      ctx.riskRulePct != null
        ? sev === 'warning'
          ? ` That is over your ${ctx.riskRulePct}% limit.`
          : ` Your limit is ${ctx.riskRulePct}%.`
        : '';
    out.push({
      id: 'risk',
      severity: sev,
      title: `Risk ${money(ctx.riskMoney, ctx.currency)} (${pct.toFixed(2)}%)`,
      detail: `If the stop is hit you lose ${money(ctx.riskMoney, ctx.currency)}, about ${pct.toFixed(2)}% of the account.${ruleTail}`,
    });
  }

  // 3b. Stop sizing vs current volatility (ATR).
  if (primary && ctx.stopLoss != null && ctx.pipSize && ctx.pipSize > 0) {
    const a = atr(primary.candles);
    if (a && a > 0) {
      const ratio = Math.abs(ctx.entry - ctx.stopLoss) / a;
      const stopPips = Math.round(Math.abs(ctx.entry - ctx.stopLoss) / ctx.pipSize);
      const atrPips = Math.round(a / ctx.pipSize);
      const tight = ratio < 0.5;
      out.push({
        id: 'atr',
        severity: tight ? 'caution' : 'info',
        title: `Stop is ${ratio.toFixed(1)}x the ${primary.tf} ATR`,
        detail: tight
          ? `Your ${stopPips} pip stop is only ${ratio.toFixed(1)}x the ${primary.tf} ATR (${atrPips} pips), tight relative to how the pair is moving, so normal noise could clip it.`
          : ratio < 1
            ? `Your ${stopPips} pip stop is ${ratio.toFixed(1)}x the ${primary.tf} ATR (${atrPips} pips), so an average swing could still reach it.`
            : `Your ${stopPips} pip stop is ${ratio.toFixed(1)}x the ${primary.tf} ATR (${atrPips} pips), comfortably outside typical noise.`,
      });
    }
  }

  // 3c. Open exposure across positions.
  if (ctx.exposure && ctx.exposure.others > 0) {
    const e = ctx.exposure;
    const shared = e.sharedCurrencies.length
      ? ` You already have ${e.sharedCurrencies.join(' and ')} exposure in another open trade, so this stacks it.`
      : '';
    const total =
      e.totalRiskPct != null
        ? ` Across your ${e.others + 1} open trades you risk about ${e.totalRiskPct.toFixed(1)}% if every stop hits.`
        : '';
    out.push({
      id: 'exposure',
      severity: e.sharedCurrencies.length ? 'caution' : 'info',
      title: `${e.others} other open ${e.others === 1 ? 'trade' : 'trades'}`,
      detail: `This is not your only position.${shared}${total}`,
    });
  }

  // 3d. Risk against the prop drawdown buffer.
  if (ctx.riskMoney != null && ctx.propBuffer) {
    const b = ctx.propBuffer;
    const bits: string[] = [];
    let heavy = false;
    if (b.dailyRemaining != null && b.dailyRemaining > 0) {
      const p = ctx.riskMoney / b.dailyRemaining;
      bits.push(`${Math.round(p * 100)}% of your remaining daily loss room`);
      if (p >= 0.3) heavy = true;
    }
    if (b.overallRemaining != null && b.overallRemaining > 0) {
      const p = ctx.riskMoney / b.overallRemaining;
      bits.push(`${Math.round(p * 100)}% of your overall drawdown buffer`);
      if (p >= 0.2) heavy = true;
    }
    if (bits.length) {
      out.push({
        id: 'prop-buffer',
        severity: heavy ? 'caution' : 'info',
        title: 'Against your prop buffer',
        detail: `This stop is ${bits.join(' and ')}.`,
      });
    }
  }

  // 4. Structure / stop-run zones (primary timeframe; always gives a read).
  if (primary) out.push(...levelSignals(ctx, primary.candles));

  // 4b. Round-number proximity for the stop or target.
  if (ctx.pipSize && ctx.pipSize > 0) {
    for (const [label, price] of [
      ['target', ctx.takeProfit],
      ['stop', ctx.stopLoss],
    ] as const) {
      if (price == null) continue;
      const r = nearestRound(price, ctx.pipSize);
      if (r && r.pips <= 8) {
        out.push({
          id: `round-${label}`,
          severity: 'info',
          title: `Round number near your ${label}`,
          detail: `Your ${label} at ${fmt(price)} sits about ${Math.round(r.pips)} pips from the round level ${fmt(r.level)}, where price often stalls or reacts.`,
        });
        break; // one round-number note is enough
      }
    }
  }

  // 5. Spread (info when known, caution when unusually wide).
  if (ctx.spreadNow != null && ctx.pipSize && ctx.pipSize > 0) {
    const wide =
      ctx.spreadAvg != null &&
      ctx.spreadAvg > 0 &&
      ctx.spreadNow / ctx.spreadAvg >= 2;
    const pips = ctx.spreadNow / ctx.pipSize;
    out.push({
      id: 'spread',
      severity: wide ? 'caution' : 'info',
      title: wide ? 'Spread is wide right now' : `Spread ${pips.toFixed(1)} pips`,
      detail: wide
        ? `Spread is ${(ctx.spreadNow / (ctx.spreadAvg as number)).toFixed(1)}x its usual level, an expensive moment to enter.`
        : `Current spread is ${pips.toFixed(1)} pips.`,
    });
  }

  // 6. News (ALWAYS, when the calendar was reachable): a prop-rule blackout if
  //    one applies, else the nearest high-impact event, else explicit calm.
  if (ctx.news) {
    const n = ctx.news;
    if (n.ruleState === 'blackout' && n.ruleMessage) {
      out.push({
        id: 'news',
        severity: 'warning',
        title: 'Inside a news no-go window',
        detail: n.ruleMessage,
      });
    } else if (n.ruleState === 'approaching' && n.ruleMessage) {
      out.push({
        id: 'news',
        severity: 'caution',
        title: 'High-impact news approaching',
        detail: n.ruleMessage,
      });
    } else if (n.nextEvent) {
      out.push({
        id: 'news',
        severity: 'info',
        title: `High-impact news in ${n.nextEvent.minutes}m`,
        detail: `${n.nextEvent.currency} ${n.nextEvent.title} (high impact) is about ${n.nextEvent.minutes} minutes away, expect a volatility spike around it.`,
      });
    } else {
      const ccy = n.currencies.length ? n.currencies.join(' or ') : 'this pair';
      out.push({
        id: 'news',
        severity: 'info',
        title: 'News calendar is clear',
        detail: `No high-impact news on ${ccy} in the next ${n.horizonHours} hours, so conditions look calm.`,
      });
    }
  }

  // 7. The trader's own leaks (their history, not generic advice).
  if (
    ctx.minutesSinceLastLoss != null &&
    ctx.minutesSinceLastLoss >= 0 &&
    ctx.minutesSinceLastLoss * 60_000 < REVENGE_WINDOW_MS
  ) {
    out.push({
      id: 'revenge',
      severity: 'warning',
      title: 'Looks like a revenge trade',
      detail: `You opened this ${Math.round(ctx.minutesSinceLastLoss)} min after a loss closed. Entering this soon after a loss is a pattern that has cost you before.`,
    });
  }
  if (
    ctx.medianVolumeLots != null &&
    ctx.medianVolumeLots > 0 &&
    ctx.volumeLots >= ctx.medianVolumeLots * OVERSIZE_FACTOR
  ) {
    const x = ctx.volumeLots / ctx.medianVolumeLots;
    out.push({
      id: 'oversize',
      severity: 'caution',
      title: 'Bigger than your usual size',
      detail: `This is ${x.toFixed(1)}x your typical ${ctx.medianVolumeLots} lots. Sizing up after a wobble is a common way to turn a small day into a bad one.`,
    });
  }

  // 8. Committed rules this trade looks like it breaks (their own rules).
  //    Multiple breaks collapse into ONE signal so the headline never repeats
  //    "Breaks a rule you committed to".
  if (ctx.committedRuleHits.length === 1) {
    out.push({
      id: 'committed',
      severity: 'warning',
      title: 'Breaks a rule you committed to',
      detail: `${ctx.committedRuleHits[0]} This is the exact pattern you committed to stopping.`,
    });
  } else if (ctx.committedRuleHits.length > 1) {
    out.push({
      id: 'committed',
      severity: 'warning',
      title: `Breaks ${ctx.committedRuleHits.length} rules you committed to`,
      detail: `This trade breaks rules you committed to: ${ctx.committedRuleHits.join('; ')}. These are the exact patterns you committed to stopping.`,
    });
  }

  // 9. Their record on this pair, and whether this is their worst session.
  if (ctx.pairStats && ctx.pairStats.trades >= 5) {
    out.push({
      id: 'pair-stats',
      severity: ctx.pairStats.winRatePct < 40 ? 'caution' : 'info',
      title: `Your ${ctx.symbol} record is ${ctx.pairStats.winRatePct}%`,
      detail: `You have won ${ctx.pairStats.winRatePct}% of your ${ctx.pairStats.trades} trades on ${ctx.symbol}.`,
    });
  }
  if (ctx.session) {
    out.push({
      id: 'session',
      severity: ctx.session.isWorst ? 'caution' : 'info',
      title: ctx.session.isWorst
        ? `${ctx.session.current} is your worst session`
        : `${ctx.session.current} session`,
      detail: ctx.session.isWorst
        ? `You are trading the ${ctx.session.current} session, historically your worst by P&L.`
        : `You are trading the ${ctx.session.current} session.`,
    });
  }

  // Worst-first, but stable within a severity so the read flows (trend, R:R,
  // risk, structure, ...).
  const rank: Record<GuardSeverity, number> = { warning: 0, caution: 1, info: 2 };
  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank[a.s.severity] - rank[b.s.severity] || a.i - b.i)
    .map((x) => x.s);
}

/** A one-line headline of the flags (warnings + cautions) for a glance and for
 *  the Telegram alert. Worst-first, so it leads with what matters. */
export function flagHeadline(signals: GuardSignal[]): string {
  const flags = signals.filter(
    (s) => s.severity === 'warning' || s.severity === 'caution',
  );
  if (!flags.length) return 'Clean read, nothing flags on this one.';
  // Distinct titles only, so a repeated headline never shows twice. List them
  // all (up to a sane ceiling) instead of a vague "+N more".
  const unique = [...new Set(flags.map((s) => s.title))];
  const titles = unique.slice(0, 6);
  const more = unique.length - titles.length;
  return `${titles.join(', ')}${more > 0 ? `, and ${more} more` : ''}. ${unique.length} flag${unique.length === 1 ? '' : 's'} to weigh.`;
}
