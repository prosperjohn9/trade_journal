export type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
export type Direction = 'BUY' | 'SELL';

export type TradeRow = {
  id: string;
  opened_at: string; // timestamps ISO string from DB
  instrument: string | null;
  direction: Direction | null;
  outcome: Outcome | null;
  pnl_amount: number | null; // can be negative for losses
  pnl_percent: number | null; // can be negative for losses
  risk_amount?: number | null;
  r_multiple?: number | null;
};

export type AnalyticsFilters = {
  // Use either month (YYYY-MM) or date range
  month?: string; // '2025-12'
  startIso?: string; // inclusive ISO
  endIso?: string; // exclusive ISO

  instruments?: string[]; // ['EURUSD', 'AUDUSD']
  direction?: Direction | 'ALL';
  outcome?: Outcome | 'ALL';

  // Used for daily grouping + session/hour analytics
  timeZone?: string; // IANA, e.g. 'Europe/Istanbul'
};

export type DailyPoint = {
  dayKey: string; // YYYY-MM-DD
  dateLabel: string; // display label
  pnl: number; // sum of pnl_amount for the day
  equity: number; // cumulative equity after the day closes
  ret: number; // pnl / prev_equity (daily return)
};

export type SymbolStat = {
  symbol: string;
  pnl: number;
  count: number;
  winRate: number;
};

export type CoreReport = {
  // Inputs
  timeZone: string;
  startingBalance: number;
  endingBalance: number;

  // Counts
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number; // %

  // Money
  netPnl: number;
  grossProfit: number;
  grossLossAbs: number;

  avgWin: number;
  avgLoss: number; // negative if your losses are negative
  rrr: number; // avgWin / abs(avgLoss)
  expectancy: number; // per trade

  profitFactor: number; // grossProfit / abs(grossLoss)
  sharpe: number; // daily returns, annualized sqrt(252)

  maxDrawdown: number; // absolute
  maxDrawdownPct: number; // 0..1

  bestDay: DailyPoint | null;
  worstDay: DailyPoint | null;

  daily: DailyPoint[];
  bySymbol: SymbolStat[];
};

function n(x: any, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(variance);
}

function maxDrawdown(equity: number[]) {
  let peak = -Infinity;
  let maxDD = 0;
  let maxDDPct = 0;

  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = peak - v;
    const ddPct = peak > 0 ? dd / peak : 0;
    if (dd > maxDD) maxDD = dd;
    if (ddPct > maxDDPct) maxDDPct = ddPct;
  }
  return { maxDD, maxDDPct };
}

function normalizeSymbol(s: string | null) {
  return (s ?? '').trim().toUpperCase();
}

function inInstrumentFilter(symbol: string, instruments?: string[]) {
  if (!instruments || instruments.length === 0) return true;
  const set = new Set(instruments.map((x) => x.trim().toUpperCase()));
  return set.has(symbol);
}

export function monthToRange(month: string) {
  // month: 'YYYY-MM'
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Apply client-side filters after fetching (useful for analytics).
 * For monthly report also filter at SQL-level and pass already-filtered trades.
 */
export function filterTrades(trades: TradeRow[], f: AnalyticsFilters) {
  const dir = f.direction ?? 'ALL';
  const out = f.outcome ?? 'ALL';

  return trades.filter((t) => {
    const symbol = normalizeSymbol(t.instrument);

    if (!inInstrumentFilter(symbol, f.instruments)) return false;
    if (dir !== 'ALL' && t.direction !== dir) return false;
    if (out !== 'ALL' && t.outcome !== out) return false;

    // Date range filtering (opened_at is ISO)
    if (f.startIso && t.opened_at < f.startIso) return false;
    if (f.endIso && t.opened_at >= f.endIso) return false;

    return true;
  });
}

/**
 * Main computation engine: returns all core metrics + equity curve points.
 * - Uses pnl_amount for equity curve & PF.
 * - Uses daily returns for Sharpe.
 * - Uses timeZone for grouping trades into days (for Best/Worst day + Sharpe).
 */
export function computeReport(params: {
  trades: TradeRow[];
  startingBalance: number; // from profiles.starting_balance
  timeZone?: string; // defaults to browser tz at call site; fallback UTC
}): CoreReport {
  const timeZone = params.timeZone || 'UTC';
  const startingBalance = n(params.startingBalance, 0);

  // Ensure numbers are safe
  const rows = params.trades.map((t) => ({
    ...t,
    instrument: normalizeSymbol(t.instrument),
    pnl_amount: n(t.pnl_amount, 0),
    pnl_percent: n(t.pnl_percent, 0),
  }));

  const totalTrades = rows.length;
  const wins = rows.filter((t) => t.outcome === 'WIN');
  const losses = rows.filter((t) => t.outcome === 'LOSS');
  const breakeven = rows.filter((t) => t.outcome === 'BREAKEVEN');

  const netPnl = rows.reduce((s, t) => s + n(t.pnl_amount), 0);

  const grossProfit = wins.reduce((s, t) => s + n(t.pnl_amount), 0);
  const grossLossAbs = Math.abs(
    losses.reduce((s, t) => s + n(t.pnl_amount), 0)
  );

  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length
    ? losses.reduce((s, t) => s + n(t.pnl_amount), 0) / losses.length
    : 0; // should be negative if losses stored negative

  const winRate = totalTrades ? (wins.length / totalTrades) * 100 : 0;
  const lossRate = totalTrades ? losses.length / totalTrades : 0;

  const rrr = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : 0;

  const expectancy = totalTrades
    ? (wins.length / totalTrades) * avgWin + lossRate * avgLoss
    : 0;

  const profitFactor =
    grossLossAbs > 0
      ? grossProfit / grossLossAbs
      : grossProfit > 0
      ? Infinity
      : 0;

  // Aggregate by symbol
  const bySymbolMap = new Map<
    string,
    { pnl: number; count: number; wins: number }
  >();
  for (const t of rows) {
    const sym = t.instrument || '';
    if (!sym) continue;
    const prev = bySymbolMap.get(sym) ?? { pnl: 0, count: 0, wins: 0 };
    prev.pnl += n(t.pnl_amount);
    prev.count += 1;
    if (t.outcome === 'WIN') prev.wins += 1;
    bySymbolMap.set(sym, prev);
  }
  const bySymbol: SymbolStat[] = [...bySymbolMap.entries()]
    .map(([symbol, v]) => ({
      symbol,
      pnl: v.pnl,
      count: v.count,
      winRate: v.count ? (v.wins / v.count) * 100 : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);

  // Daily grouping in chosen timezone
  const fmtDayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const fmtLabel = new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'short',
    day: '2-digit',
  });

  const dailyMap = new Map<string, { pnl: number; label: string }>();
  for (const t of rows) {
    const d = new Date(t.opened_at);
    const dayKey = fmtDayKey.format(d); // YYYY-MM-DD
    const label = fmtLabel.format(d);
    const prev = dailyMap.get(dayKey) ?? { pnl: 0, label };
    prev.pnl += n(t.pnl_amount);
    dailyMap.set(dayKey, prev);
  }

  const dailyKeys = [...dailyMap.keys()].sort();

  let equity = startingBalance;
  const daily: DailyPoint[] = [];
  for (const k of dailyKeys) {
    const { pnl, label } = dailyMap.get(k)!;
    const prevEquity = equity;
    equity = equity + pnl;
    const ret = prevEquity !== 0 ? pnl / prevEquity : 0;

    daily.push({
      dayKey: k,
      dateLabel: label,
      pnl,
      equity,
      ret,
    });
  }

  const endingBalance = startingBalance + netPnl;

  const equitySeries = [startingBalance, ...daily.map((p) => p.equity)];
  const { maxDD, maxDDPct } = maxDrawdown(equitySeries);

  const bestDay = daily.length
    ? [...daily].sort((a, b) => b.pnl - a.pnl)[0]
    : null;
  const worstDay = daily.length
    ? [...daily].sort((a, b) => a.pnl - b.pnl)[0]
    : null;

  // Sharpe (daily returns, rf=0), annualized sqrt(252)
  const dailyReturns = daily.map((p) => p.ret);
  const sharpe =
    std(dailyReturns) > 0
      ? (mean(dailyReturns) / std(dailyReturns)) * Math.sqrt(252)
      : 0;

  return {
    timeZone,
    startingBalance,
    endingBalance,

    totalTrades,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate,

    netPnl,
    grossProfit,
    grossLossAbs,

    avgWin,
    avgLoss,
    rrr,
    expectancy,

    profitFactor,
    sharpe,

    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,

    bestDay,
    worstDay,

    daily,
    bySymbol,
  };
}