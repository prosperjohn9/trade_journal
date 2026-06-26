// Per-signal outcome calibration: how each Foresight flag has actually played out
// for THIS trader. Built from logged reads (the fired signals + the trade's
// outcome + closed P&L), it turns the read from a generic checklist into a
// personal, self-validating one ("you're 4-13 on counter-trend") and lets a
// single setup grade fall out. Pure and offline-tested; the DB fetch lives in
// the route layer.

export type CalSeverity = 'info' | 'caution' | 'warning';
export type CalSignal = { id: string; severity: CalSeverity };
export type CalOutcome = 'WIN' | 'LOSS' | 'BREAKEVEN' | null;
export type CalRead = {
  signals: CalSignal[];
  outcome: CalOutcome;
  pnl: number | null;
};

/** A flag needs at least this many resolved trades before we quote its record. */
export const MIN_SAMPLES = 5;

export type RawReadRow = {
  signals: unknown;
  outcome: unknown;
  closed_pnl: unknown;
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

/** Map raw foresight_reads rows (jsonb signals, text outcome, numeric pnl) into
 *  the shape the calibration aggregator expects. Pure, used on client + server. */
export function rowsToCalReads(rows: RawReadRow[]): CalRead[] {
  return rows.map((r) => ({
    signals: asSignals(r.signals),
    outcome: asOutcome(r.outcome),
    pnl: asPnl(r.closed_pnl),
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
  'entry-zone': 'entries at a fresh zone',
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
  winRatePct: number | null;
  netPnl: number;
};

/** Aggregate per-signal records over reads that have a known outcome. A read
 *  counts once per distinct key (so a flag that fires twice in one read is one
 *  data point). */
export function computeCalibration(reads: CalRead[]): Map<string, SignalStat> {
  const m = new Map<string, SignalStat>();
  for (const r of reads) {
    if (r.outcome == null) continue; // only resolved trades inform calibration
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
          netPnl: 0,
        };
        m.set(key, s);
      }
      s.total += 1;
      if (typeof r.pnl === 'number') s.netPnl += r.pnl;
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
  for (const s of m.values())
    s.winRatePct = s.decided > 0 ? Math.round((s.wins / s.decided) * 100) : null;
  return m;
}

/** Plain-English tail appended to a fired signal's detail, e.g. " Your record
 *  when this fires: 4 wins to 13 losses, a 24% win rate, and you have lost
 *  $2,140 on those trades." Empty when too few resolved trades. */
export function calibrationTail(
  stat: SignalStat | undefined,
  money: (n: number) => string,
): string {
  if (!stat || stat.total < MIN_SAMPLES || stat.winRatePct == null) return '';
  const wl = `${stat.wins} win${stat.wins === 1 ? '' : 's'} to ${stat.losses} loss${stat.losses === 1 ? '' : 'es'}`;
  const pnl =
    stat.netPnl > 0
      ? `you have made ${money(stat.netPnl)} on those trades`
      : stat.netPnl < 0
        ? `you have lost ${money(stat.netPnl)} on those trades`
        : `you are about flat on those trades`;
  return ` Your record when this fires: ${wl}, a ${stat.winRatePct}% win rate, and ${pnl}.`;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** A single setup grade from the fired signals, weighted by the trader's own
 *  calibration where there is a sample: a flag they really lose on weighs double,
 *  a flag that does not actually hurt them is forgiven, and a positive they win on
 *  lifts the grade. Deterministic. */
export function gradeRead(
  signals: CalSignal[],
  cal: Map<string, SignalStat>,
): { grade: Grade; score: number } {
  let score = 0;
  for (const s of signals) {
    let pts =
      s.severity === 'warning' ? -2 : s.severity === 'caution' ? -1 : 0;
    // Recognised positives (a quality entry / with-trend alignment).
    if (s.id === 'entry-zone' || (s.id === 'trend' && s.severity === 'info'))
      pts = 1;
    const stat = cal.get(calibKey(s));
    if (stat && stat.total >= MIN_SAMPLES && stat.winRatePct != null) {
      if (pts < 0 && stat.winRatePct < 40) pts *= 2;
      else if (pts < 0 && stat.winRatePct >= 60) pts = 0;
      else if (pts > 0 && stat.winRatePct >= 60) pts += 1;
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
