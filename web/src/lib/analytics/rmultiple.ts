// R-multiple analytics. Pure and client/server usable. R expresses a trade's
// result in units of its initial risk: +2R means it made twice what it risked,
// -1R means it lost a full unit of risk.
//
// R is resolved in priority order: an explicit r_multiple, else a money
// risk_amount (net / risk), else derived from prices as reward-per-unit over
// risk-per-unit using entry, exit, and stop. The price formula is direction
// aware and needs no contract size, since the price ratio cancels it out.

export type RTrade = {
  direction?: 'BUY' | 'SELL' | null;
  net_pnl?: number | null;
  pnl_amount?: number | null;
  r_multiple?: number | null;
  risk_amount?: number | null;
  entry_price?: number | null;
  exit_price?: number | null;
  stop_loss?: number | null;
};

function netOf(t: RTrade): number {
  const n = t.net_pnl;
  if (n != null && Number.isFinite(Number(n))) return Number(n);
  return Number(t.pnl_amount ?? 0);
}

/** Realized R for one trade, or null when risk is undefined (no stop / no risk). */
export function tradeRMultiple(t: RTrade): number | null {
  if (t.r_multiple != null && Number.isFinite(Number(t.r_multiple))) {
    return Number(t.r_multiple);
  }

  const risk = t.risk_amount != null ? Number(t.risk_amount) : null;
  if (risk != null && Number.isFinite(risk) && risk > 0) {
    return netOf(t) / risk;
  }

  const entry = t.entry_price != null ? Number(t.entry_price) : null;
  const exit = t.exit_price != null ? Number(t.exit_price) : null;
  const stop = t.stop_loss != null ? Number(t.stop_loss) : null;
  if (
    entry != null &&
    exit != null &&
    stop != null &&
    Number.isFinite(entry) &&
    Number.isFinite(exit) &&
    Number.isFinite(stop) &&
    (t.direction === 'BUY' || t.direction === 'SELL')
  ) {
    const isLong = t.direction === 'BUY';
    const riskPerUnit = isLong ? entry - stop : stop - entry;
    if (riskPerUnit > 0) {
      const rewardPerUnit = isLong ? exit - entry : entry - exit;
      return rewardPerUnit / riskPerUnit;
    }
  }

  return null;
}

export type RBucket = { label: string; count: number; negative: boolean };

export type RReport = {
  total: number; // all trades in scope
  withR: number; // trades with a computable R
  coveragePct: number;
  totalR: number;
  expectancyR: number; // average R across trades with R
  avgWinR: number;
  avgLossR: number; // negative
  winRateR: number;
  profitFactorR: number; // sum of positive R over absolute sum of negative R
  best: number | null;
  worst: number | null;
  distribution: RBucket[];
  values: number[];
};

const BUCKETS: { label: string; negative: boolean; test: (r: number) => boolean }[] =
  [
    { label: '≤ -2R', negative: true, test: (r) => r < -2 },
    { label: '-2 to -1R', negative: true, test: (r) => r >= -2 && r < -1 },
    { label: '-1 to 0R', negative: true, test: (r) => r >= -1 && r < 0 },
    { label: '0 to 1R', negative: false, test: (r) => r >= 0 && r < 1 },
    { label: '1 to 2R', negative: false, test: (r) => r >= 1 && r < 2 },
    { label: '2 to 3R', negative: false, test: (r) => r >= 2 && r < 3 },
    { label: '≥ 3R', negative: false, test: (r) => r >= 3 },
  ];

export function computeRReport(trades: RTrade[]): RReport {
  const values: number[] = [];
  for (const t of trades) {
    const r = tradeRMultiple(t);
    if (r != null && Number.isFinite(r)) values.push(r);
  }

  const total = trades.length;
  const withR = values.length;
  const totalR = values.reduce((s, r) => s + r, 0);
  const wins = values.filter((r) => r > 0);
  const losses = values.filter((r) => r < 0);
  const sumWin = wins.reduce((s, r) => s + r, 0);
  const sumLoss = losses.reduce((s, r) => s + r, 0);
  const sumLossAbs = Math.abs(sumLoss);

  const distribution = BUCKETS.map((b) => ({
    label: b.label,
    negative: b.negative,
    count: values.filter((r) => b.test(r)).length,
  }));

  return {
    total,
    withR,
    coveragePct: total ? (withR / total) * 100 : 0,
    totalR,
    expectancyR: withR ? totalR / withR : 0,
    avgWinR: wins.length ? sumWin / wins.length : 0,
    avgLossR: losses.length ? sumLoss / losses.length : 0,
    winRateR: withR ? (wins.length / withR) * 100 : 0,
    profitFactorR:
      sumLossAbs > 0 ? sumWin / sumLossAbs : sumWin > 0 ? Infinity : 0,
    best: withR ? Math.max(...values) : null,
    worst: withR ? Math.min(...values) : null,
    distribution,
    values,
  };
}
