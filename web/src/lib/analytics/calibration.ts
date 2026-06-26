// Per-signal outcome calibration: how each Foresight flag has actually played out
// for THIS trader. Built from logged reads (the fired signals + the trade's
// outcome + closed P&L), it turns the read from a generic checklist into a
// personal, self-validating one and lets a single setup grade fall out.
//
// Two reliability guards keep it honest, not noisy:
//   - SMALL SAMPLES: the win rate we GRADE on is shrunk toward the trader's
//     overall win rate (a Beta prior worth PRIOR_STRENGTH trades), so a 1-4
//     record off five trades does not get treated as a real 20% edge. The
//     displayed record stays the true counts, with an "early read" qualifier
//     under CONFIDENT_SAMPLES.
//   - CURRENCY: net P&L is tracked per account currency, never summed across
//     currencies into a meaningless total.
// Pure and offline-tested; the DB fetch lives in the route layer.

export type CalSeverity = 'info' | 'caution' | 'warning';
export type CalSignal = { id: string; severity: CalSeverity };
export type CalOutcome = 'WIN' | 'LOSS' | 'BREAKEVEN' | null;
export type CalRead = {
  signals: CalSignal[];
  outcome: CalOutcome;
  pnl: number | null;
  currency: string | null;
};

/** A flag needs at least this many resolved (win/loss) trades before we quote it. */
export const MIN_SAMPLES = 5;
/** Below this many decided trades the record is flagged as an early read. */
export const CONFIDENT_SAMPLES = 12;
/** Strength of the base-rate prior, in pseudo-trades, used to shrink win rates. */
export const PRIOR_STRENGTH = 10;

export type RawReadRow = {
  signals: unknown;
  outcome: unknown;
  closed_pnl: unknown;
  currency?: unknown;
};

function asOutcome(v: unknown): CalOutcome {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return s === 'WIN' || s === 'LOSS' || s === 'BREAKEVEN' ? s : null;
}

function asSignals(v: unknown): CalSignal[] {
  if (!Array.isArray(v)) return [];
  const out: CalSignal[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as { id?: unknown; severity?: unknown };
    if (typeof o.id !== 'string') continue;
    out.push({
      id: o.id,
      severity:
        o.severity === 'warning' || o.severity === 'caution'
          ? o.severity
          : 'info',
    });
  }
  return out;
}

function asPnl(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Map raw foresight_reads rows into the shape the aggregator expects. Pure;
 *  used on client + server. Currency is attached by the caller (joined from the
 *  account), defaulting to USD. */
export function rowsToCalReads(rows: RawReadRow[]): CalRead[] {
  return rows.map((r) => ({
    signals: asSignals(r.signals),
    outcome: asOutcome(r.outcome),
    pnl: asPnl(r.closed_pnl),
    currency: typeof r.currency === 'string' && r.currency ? r.currency : null,
  }));
}

/** A stable calibration key per signal. Most map 1:1 to the signal id; the trend
 *  signal is split by variant so "counter-trend" is measured on its own. */
export function calibKey(s: CalSignal): string {
  if (s.id === 'trend')
    return s.severity === 'caution'
      ? 'counter-trend'
      : s.severity === 'info'
        ? 'with-trend'
        : 'flat-trend';
  return s.id;
}

const LABELS: Record<string, string> = {
  'counter-trend': 'counter-trend entries',
  'with-trend': 'with-trend entries',
  'flat-trend': 'range entries',
  'tp-zone': 'a fresh zone in front of target',
  'tp-level': 'an untested level in front of target',
  'tp-liquidity': 'liquidity in front of target',
  'tp-tired': 'a tested level in front of target',
  'sl-raid': 'a stop in a wick zone',
  'sl-liquidity': 'a stop under a liquidity pool',
  'sl-tight': 'a stop inside your structure',
  'sl-protects': 'a stop that protects the idea',
  'sl-wide': 'a stop wider than the idea needs',
  structure: 'the market-structure read',
  'entry-zone': 'entries at a fresh zone',
  'htf-confluence': 'higher-timeframe confluence',
  'htf-against': 'fighting a higher-timeframe zone',
  rr: 'a sub-1 reward-to-risk',
  risk: 'oversized risk',
  atr: 'a tight stop vs volatility',
  'prop-buffer': 'a heavy hit to the prop buffer',
  exposure: 'stacked open exposure',
  spread: 'a wide spread',
  news: 'a news window',
  revenge: 'revenge trades',
  'cold-streak': 'trades on a loss streak',
  oversize: 'oversized trades',
  session: 'your worst session',
  'no-sl': 'no stop set',
};
export function calibLabel(key: string): string {
  return LABELS[key] ?? key.replace(/-/g, ' ');
}

export type SignalStat = {
  key: string;
  label: string;
  wins: number;
  losses: number;
  breakeven: number;
  /** wins + losses (denominator for win rate). */
  decided: number;
  /** all resolved reads where this flag fired. */
  total: number;
  /** The raw win rate of the actual record (what we display). */
  winRatePct: number | null;
  /** Win rate shrunk toward the trader's base rate (what we grade/decide on). */
  shrunkWinRatePct: number | null;
  /** Net P&L per account currency (never summed across currencies). */
  netByCurrency: Record<string, number>;
};

/** Aggregate per-signal records over reads that have a known outcome. A read
 *  counts once per distinct key. Win rates are shrunk toward the trader's overall
 *  win rate so small samples stay humble. */
export function computeCalibration(reads: CalRead[]): Map<string, SignalStat> {
  // The trader's overall win rate is the shrinkage prior.
  let gWins = 0;
  let gDecided = 0;
  for (const r of reads) {
    if (r.outcome === 'WIN') {
      gWins += 1;
      gDecided += 1;
    } else if (r.outcome === 'LOSS') gDecided += 1;
  }
  const baseRate = gDecided > 0 ? gWins / gDecided : 0.5;

  const m = new Map<string, SignalStat>();
  for (const r of reads) {
    if (r.outcome == null) continue;
    const ccy = r.currency || 'USD';
    const keys = new Set(r.signals.map(calibKey));
    for (const key of keys) {
      let s = m.get(key);
      if (!s) {
        s = {
          key,
          label: calibLabel(key),
          wins: 0,
          losses: 0,
          breakeven: 0,
          decided: 0,
          total: 0,
          winRatePct: null,
          shrunkWinRatePct: null,
          netByCurrency: {},
        };
        m.set(key, s);
      }
      s.total += 1;
      if (typeof r.pnl === 'number')
        s.netByCurrency[ccy] = (s.netByCurrency[ccy] ?? 0) + r.pnl;
      if (r.outcome === 'WIN') {
        s.wins += 1;
        s.decided += 1;
      } else if (r.outcome === 'LOSS') {
        s.losses += 1;
        s.decided += 1;
      } else {
        s.breakeven += 1;
      }
    }
  }
  for (const s of m.values()) {
    s.winRatePct =
      s.decided > 0 ? Math.round((s.wins / s.decided) * 100) : null;
    s.shrunkWinRatePct =
      s.decided > 0
        ? Math.round(
            ((s.wins + baseRate * PRIOR_STRENGTH) /
              (s.decided + PRIOR_STRENGTH)) *
              100,
          )
        : null;
  }
  return m;
}

/** Sum of a stat's net across currencies, for SORTING only (not display). */
export function statNetSum(stat: SignalStat): number {
  return Object.values(stat.netByCurrency).reduce((s, n) => s + n, 0);
}

/** Plain-English tail appended to a fired signal's detail, in the current
 *  account's currency. Empty when too few resolved trades. */
export function calibrationTail(
  stat: SignalStat | undefined,
  money: (n: number) => string,
  currency: string,
): string {
  if (!stat || stat.decided < MIN_SAMPLES || stat.winRatePct == null) return '';
  const wl = `${stat.wins} win${stat.wins === 1 ? '' : 's'} to ${stat.losses} loss${stat.losses === 1 ? '' : 'es'}`;
  const net = stat.netByCurrency[currency] ?? 0;
  const pnl =
    net > 0
      ? `you have made ${money(net)} on those trades`
      : net < 0
        ? `you have lost ${money(net)} on those trades`
        : `you are about flat on those trades`;
  const early =
    stat.decided < CONFIDENT_SAMPLES ? ' (still an early read)' : '';
  return ` Your record when this fires: ${wl}, a ${stat.winRatePct}% win rate${early}, and ${pnl}.`;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** A single setup grade from the fired signals, weighted by the trader's own
 *  calibration where there is a sample. Uses the SHRUNK win rate so a noisy
 *  early read cannot swing the grade. */
export function gradeRead(
  signals: CalSignal[],
  cal: Map<string, SignalStat>,
): { grade: Grade; score: number } {
  let score = 0;
  for (const s of signals) {
    let pts =
      s.severity === 'warning' ? -2 : s.severity === 'caution' ? -1 : 0;
    if (s.id === 'entry-zone' || (s.id === 'trend' && s.severity === 'info'))
      pts = 1;
    const stat = cal.get(calibKey(s));
    if (
      stat &&
      stat.decided >= MIN_SAMPLES &&
      stat.shrunkWinRatePct != null
    ) {
      if (pts < 0 && stat.shrunkWinRatePct < 40) pts *= 2;
      else if (pts < 0 && stat.shrunkWinRatePct >= 60) pts = 0;
      else if (pts > 0 && stat.shrunkWinRatePct >= 60) pts += 1;
    }
    score += pts;
  }
  const grade: Grade =
    score >= 1
      ? 'A'
      : score >= -1
        ? 'B'
        : score >= -3
          ? 'C'
          : score >= -5
            ? 'D'
            : 'F';
  return { grade, score };
}
