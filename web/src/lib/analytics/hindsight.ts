// The Hindsight Report: counterfactual P&L. Classifies the trades a trader's
// own behavior produced (revenge entries, oversizing after losses, weak
// sessions/weekdays, emotion-tagged tilt) and answers, in money, "what would
// this period look like without that leak?". Pure computation on journal data,
// no AI calls, no external cost.

export type HindsightTrade = {
  opened_at: string;
  closed_at: string | null;
  outcome: string | null; // WIN | LOSS | BREAKEVEN
  pnl: number; // net
  volume: number | null;
  instrument: string | null; // for same-instrument size comparison
  emotion_tag: string | null;
};

export type LeakKind =
  | 'revenge'
  | 'oversized'
  | 'session'
  | 'weekday'
  | 'emotion'
  | 'cold_streak';

export type LeakFinding = {
  kind: LeakKind;
  label: string;
  detail: string;
  /** The specific subject of the pattern: session name, weekday, emotion tag. */
  subject?: string;
  tradeCount: number;
  /** Money the leak cost over the period (always > 0 for reported findings). */
  cost: number;
  /** What the period's P&L would have been without this leak. */
  counterfactualPnl: number;
  lowSample: boolean;
};

// Hold-time asymmetry (loss aversion). A DIAGNOSTIC, not a counterfactual: with
// no intra-trade prices we can't honestly say "cutting early would have saved
// $X", so we report the ratio and the real money currently sitting in losers you
// held longer than your winners.
export type HoldTimeSignal = {
  winnerMedianMin: number;
  loserMedianMin: number;
  ratio: number; // loser median / winner median
  slowLossTotal: number; // total $ lost on losers held past the winner median
  slowCount: number;
};

export type HindsightReport = {
  totalTrades: number;
  actualPnl: number;
  findings: LeakFinding[]; // sorted by cost, largest first
  biggest: LeakFinding | null;
  holdTime: HoldTimeSignal | null;
};

export const REVENGE_WINDOW_MS = 60 * 60 * 1000; // entered within 1h of a loss
export const OVERSIZE_FACTOR = 1.5;

export type Session = 'Asia' | 'London' | 'London-NY overlap' | 'New York';

export function sessionOf(iso: string): Session {
  const h = new Date(iso).getUTCHours();
  if (h >= 21 || h <= 6) return 'Asia';
  if (h >= 7 && h <= 11) return 'London';
  if (h >= 12 && h <= 15) return 'London-NY overlap';
  return 'New York';
}

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Median lot size PER INSTRUMENT. Lots aren't comparable across markets (7 lots
// of CADJPY is nothing like 7 lots of BTCUSD), so "usual size" is only meaningful
// within one instrument; an instrument needs `minCount` trades to qualify.
export function medianVolumeByInstrument(
  trades: HindsightTrade[],
  minCount = 4,
): Map<string, number> {
  const byInst = new Map<string, number[]>();
  for (const t of trades) {
    const inst = (t.instrument ?? '').toUpperCase();
    const v = t.volume ?? 0;
    if (!inst || v <= 0) continue;
    const arr = byInst.get(inst) ?? [];
    arr.push(v);
    byInst.set(inst, arr);
  }
  const out = new Map<string, number>();
  for (const [inst, vs] of byInst) {
    if (vs.length < minCount) continue;
    const m = median(vs);
    if (m && m > 0) out.set(inst, m);
  }
  return out;
}

function groupCost(
  trades: HindsightTrade[],
  key: (t: HindsightTrade) => string | null,
  minTrades: number,
): { name: string; count: number; pnl: number } | null {
  const groups = new Map<string, { count: number; pnl: number }>();
  for (const t of trades) {
    const k = key(t);
    if (!k) continue;
    const g = groups.get(k) ?? { count: 0, pnl: 0 };
    g.count += 1;
    g.pnl += t.pnl;
    groups.set(k, g);
  }
  let worst: { name: string; count: number; pnl: number } | null = null;
  for (const [name, g] of groups) {
    if (g.count < minTrades || g.pnl >= 0) continue;
    if (!worst || g.pnl < worst.pnl) worst = { name, ...g };
  }
  return worst;
}

// Calendar day in the trader's own timezone (YYYY-MM-DD), so "a new day resets
// the tilt streak" matches what the trader experiences, not UTC midnight.
export function dayKey(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function computeHindsightReport(
  input: HindsightTrade[],
  tz = 'UTC',
): HindsightReport {
  const trades = [...input].sort((a, b) =>
    a.opened_at < b.opened_at ? -1 : 1,
  );
  const actualPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const findings: LeakFinding[] = [];

  // 1) Revenge entries: opened shortly after the previous trade closed at a loss.
  const revenge: HindsightTrade[] = [];
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1];
    if (prev.outcome !== 'LOSS' || !prev.closed_at) continue;
    const gap =
      new Date(trades[i].opened_at).getTime() -
      new Date(prev.closed_at).getTime();
    if (gap >= 0 && gap <= REVENGE_WINDOW_MS) revenge.push(trades[i]);
  }
  const revengePnl = revenge.reduce((s, t) => s + t.pnl, 0);
  if (revenge.length && revengePnl < 0) {
    findings.push({
      kind: 'revenge',
      label: 'Revenge trades',
      detail: 'Trades entered within an hour of taking a loss',
      tradeCount: revenge.length,
      cost: -revengePnl,
      counterfactualPnl: actualPnl - revengePnl,
      lowSample: revenge.length < 5,
    });
  }

  // 2) Oversizing after a loss: post-loss positions at 1.5x+ the median size
  //    FOR THE SAME INSTRUMENT (lots aren't comparable across markets), scaled
  //    back to that instrument's median. An instrument needs a few trades to
  //    have a meaningful "usual size", else it is skipped.
  const medByInstrument = medianVolumeByInstrument(trades);
  {
    let oversizedCost = 0;
    let oversizedCount = 0;
    for (let i = 1; i < trades.length; i++) {
      const t = trades[i];
      const prev = trades[i - 1];
      const vol = t.volume ?? 0;
      const med = medByInstrument.get((t.instrument ?? '').toUpperCase());
      if (!med || prev.outcome !== 'LOSS' || vol < med * OVERSIZE_FACTOR) continue;
      const scaledPnl = t.pnl * (med / vol);
      oversizedCost += scaledPnl - t.pnl; // >0 when the extra size lost money
      oversizedCount += 1;
    }
    if (oversizedCount && oversizedCost > 0) {
      findings.push({
        kind: 'oversized',
        label: 'Oversizing after losses',
        detail: `Post-loss positions at ${OVERSIZE_FACTOR}x+ your usual size on that instrument, scaled back to normal`,
        tradeCount: oversizedCount,
        cost: oversizedCost,
        counterfactualPnl: actualPnl + oversizedCost,
        lowSample: oversizedCount < 4,
      });
    }
  }

  // 3) Worst trading session (UTC-based), if it is a net drag.
  const worstSession = groupCost(trades, (t) => sessionOf(t.opened_at), 5);
  if (worstSession) {
    findings.push({
      kind: 'session',
      label: `${worstSession.name} session`,
      subject: worstSession.name,
      detail: `All your trades opened during the ${worstSession.name} session`,
      tradeCount: worstSession.count,
      cost: -worstSession.pnl,
      counterfactualPnl: actualPnl - worstSession.pnl,
      lowSample: worstSession.count < 8,
    });
  }

  // 4) Worst weekday.
  const worstDay = groupCost(
    trades,
    (t) => WEEKDAYS[new Date(t.opened_at).getUTCDay()],
    5,
  );
  if (worstDay) {
    findings.push({
      kind: 'weekday',
      label: `Trading on ${worstDay.name}s`,
      subject: worstDay.name,
      detail: `All your trades opened on ${worstDay.name}s`,
      tradeCount: worstDay.count,
      cost: -worstDay.pnl,
      counterfactualPnl: actualPnl - worstDay.pnl,
      lowSample: worstDay.count < 8,
    });
  }

  // 5) Worst emotion tag.
  const worstEmotion = groupCost(
    trades,
    (t) => (t.emotion_tag ? t.emotion_tag.trim().toLowerCase() : null),
    3,
  );
  if (worstEmotion) {
    findings.push({
      kind: 'emotion',
      label: `Trading while "${worstEmotion.name}"`,
      subject: worstEmotion.name,
      detail: 'Trades you tagged with this emotion',
      tradeCount: worstEmotion.count,
      cost: -worstEmotion.pnl,
      counterfactualPnl: actualPnl - worstEmotion.pnl,
      lowSample: worstEmotion.count < 5,
    });
  }

  // 6) Cold-streak / tilt: trades opened while on a run of 2+ losses WITHIN THE
  //    SAME DAY. The streak resets at a new day (in the trader's timezone), so
  //    trading the next morning is never counted as tilt. Distinct from revenge
  //    (time-proximity); counterfactual is "without these tilt trades".
  const coldStreak: HindsightTrade[] = [];
  let lossRun = 0;
  let prevDay: string | null = null;
  for (const t of trades) {
    const day = dayKey(t.opened_at, tz);
    if (prevDay !== null && day !== prevDay) lossRun = 0; // new day = fresh start
    if (lossRun >= 2) coldStreak.push(t);
    if (t.outcome === 'LOSS') lossRun += 1;
    else if (t.outcome === 'WIN') lossRun = 0;
    // BREAKEVEN neither extends nor resets the run.
    prevDay = day;
  }
  const coldPnl = coldStreak.reduce((s, t) => s + t.pnl, 0);
  if (coldStreak.length >= 2 && coldPnl < 0) {
    const coldWins = coldStreak.filter((t) => t.outcome === 'WIN').length;
    const coldWinPct = Math.round((coldWins / coldStreak.length) * 100);
    const allWins = trades.filter((t) => t.outcome === 'WIN').length;
    const baseWinPct = trades.length
      ? Math.round((allWins / trades.length) * 100)
      : 0;
    findings.push({
      kind: 'cold_streak',
      label: 'Trading on tilt',
      detail: `Trades opened the same day after two or more losses in a row (won ${coldWinPct}% vs ${baseWinPct}% overall)`,
      tradeCount: coldStreak.length,
      cost: -coldPnl,
      counterfactualPnl: actualPnl - coldPnl,
      lowSample: coldStreak.length < 5,
    });
  }

  findings.sort((a, b) => b.cost - a.cost);

  // Hold-time asymmetry: diagnostic (see HoldTimeSignal).
  const holdMin = (t: HindsightTrade): number | null => {
    if (!t.closed_at) return null;
    const ms =
      new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime();
    return ms > 0 ? ms / 60000 : null;
  };
  const winHolds = trades
    .filter((t) => t.outcome === 'WIN')
    .map(holdMin)
    .filter((m): m is number => m != null);
  const lossHolds = trades
    .filter((t) => t.outcome === 'LOSS')
    .map(holdMin)
    .filter((m): m is number => m != null);
  let holdTime: HoldTimeSignal | null = null;
  if (winHolds.length >= 5 && lossHolds.length >= 5) {
    const wMed = median(winHolds) ?? 0;
    const lMed = median(lossHolds) ?? 0;
    if (wMed > 0 && lMed / wMed >= 1.3) {
      const slowLosers = trades.filter((t) => {
        const m = holdMin(t);
        return t.outcome === 'LOSS' && m != null && m > wMed;
      });
      holdTime = {
        winnerMedianMin: wMed,
        loserMedianMin: lMed,
        ratio: lMed / wMed,
        slowLossTotal: -slowLosers.reduce((s, t) => s + t.pnl, 0),
        slowCount: slowLosers.length,
      };
    }
  }

  return {
    totalTrades: trades.length,
    actualPnl,
    findings,
    biggest: findings[0] ?? null,
    holdTime,
  };
}
