// The Live Guard analyzer "brain". Given one open position plus the market and
// account context around it, it produces a list of GROUNDED signals: each one
// is computed from real data (the trade's own numbers, recent candles, the
// account, the news-rule engine, the trader's own leak history), never from a
// model's imagination. The AI layer only narrates these signals; it never
// invents them. Everything here is pure and offline-testable.
//
// Deliberately NOT here: order-flow / depth-of-market "liquidity pools". Retail
// FX/CFD has no consolidated order book, so claiming to see institutional
// liquidity would be fiction. What we CAN ground in price structure is where
// stops obviously cluster (swing highs/lows that price tends to wick), which is
// the honest version of "your stop could get raided".

import {
  REVENGE_WINDOW_MS,
  OVERSIZE_FACTOR,
} from '@/src/lib/analytics/hindsight';

export type GuardSide = 'BUY' | 'SELL';

export type GuardCandle = { o: number; h: number; l: number; c: number };

export type GuardNews = {
  state: 'clear' | 'approaching' | 'blackout';
  message: string | null;
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

type Pivot = { price: number; touches: number };

function cluster(vals: number[], tol: number): Pivot[] {
  const sorted = [...vals].sort((a, b) => a - b);
  const out: Pivot[] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(v - last.price) <= tol) {
      last.price = (last.price * last.touches + v) / (last.touches + 1);
      last.touches += 1;
    } else {
      out.push({ price: v, touches: 1 });
    }
  }
  return out;
}

/** Swing highs/lows (fractal pivots), clustered so a level tested several times
 *  shows up once with a touch count. These are where stops pile up. */
export function swingPoints(
  c: GuardCandle[],
  w = 2,
): { highs: Pivot[]; lows: Pivot[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = w; i < c.length - w; i++) {
    let isH = true;
    let isL = true;
    for (let j = i - w; j <= i + w; j++) {
      if (c[j].h > c[i].h) isH = false;
      if (c[j].l < c[i].l) isL = false;
    }
    if (isH) highs.push(c[i].h);
    if (isL) lows.push(c[i].l);
  }
  const tol = priceSpan(c) * 0.05;
  return { highs: cluster(highs, tol), lows: cluster(lows, tol) };
}

function levelSignals(ctx: GuardContext, candles: GuardCandle[]): GuardSignal[] {
  const out: GuardSignal[] = [];
  const span = priceSpan(candles);
  if (span <= 0) return out;
  const { highs, lows } = swingPoints(candles);
  const near = span * 0.08; // "just beyond" buffer

  // A tested level sitting between price and the take-profit.
  let blockedTp = false;
  if (ctx.takeProfit != null) {
    const between =
      ctx.side === 'BUY'
        ? highs.filter((l) => l.price > ctx.entry && l.price < ctx.takeProfit!)
        : lows.filter((l) => l.price < ctx.entry && l.price > ctx.takeProfit!);
    const strong = between.find((l) => l.touches >= 2);
    if (strong) {
      blockedTp = true;
      out.push({
        id: 'tp-level',
        severity: 'caution',
        title: 'Level in front of your target',
        detail: `A ${ctx.side === 'BUY' ? 'resistance' : 'support'} around ${fmt(strong.price)} sits between price and your target and has been tested ${strong.touches} times. Price can stall or reverse there before reaching your target.`,
      });
    }
  }

  // Stop parked just past an obvious swing extreme (a stop-run zone).
  if (ctx.stopLoss != null) {
    const pool = ctx.side === 'BUY' ? lows : highs;
    const hit = pool.find(
      (l) =>
        Math.abs(l.price - ctx.stopLoss!) <= near &&
        (ctx.side === 'BUY'
          ? ctx.stopLoss! <= l.price
          : ctx.stopLoss! >= l.price),
    );
    if (hit) {
      out.push({
        id: 'sl-raid',
        severity: 'caution',
        title: 'Stop sits in an obvious zone',
        detail: `Your stop at ${fmt(ctx.stopLoss)} is just past a recent swing ${ctx.side === 'BUY' ? 'low' : 'high'} near ${fmt(hit.price)}, where stops cluster and price often wicks before continuing. A little more room can dodge a stop run.`,
      });
    }
  }

  // Always give the target-path read, even when it is clear.
  if (ctx.takeProfit != null && !blockedTp) {
    out.push({
      id: 'tp-clear',
      severity: 'info',
      title: 'Clear path to target',
      detail: `No tested ${ctx.side === 'BUY' ? 'resistance' : 'support'} sits between price and your target on the structure I read.`,
    });
  }
  return out;
}

function describeTrend(d: 'up' | 'down' | 'flat'): string {
  return d === 'up' ? 'trending up' : d === 'down' ? 'trending down' : 'ranging';
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

  // 4. Structure / stop-run zones (primary timeframe; always gives a read).
  if (primary) out.push(...levelSignals(ctx, primary.candles));

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

  // 6. Prop news rule (from the news-rule engine).
  if (ctx.news && ctx.news.state !== 'clear' && ctx.news.message) {
    out.push({
      id: 'news',
      severity: ctx.news.state === 'blackout' ? 'warning' : 'caution',
      title:
        ctx.news.state === 'blackout'
          ? 'Inside a news no-go window'
          : 'High-impact news approaching',
      detail: ctx.news.message,
    });
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

  // Worst-first, but stable within a severity so the read flows (trend, R:R,
  // risk, structure, ...).
  const rank: Record<GuardSeverity, number> = { warning: 0, caution: 1, info: 2 };
  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank[a.s.severity] - rank[b.s.severity] || a.i - b.i)
    .map((x) => x.s);
}
