import { toNumberSafe } from '@/src/lib/utils/number';

export type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
export type Direction = 'BUY' | 'SELL';

export type TradeRow = {
  id: string;
  opened_at: string; 
  instrument: string | null;
  direction: Direction | null;
  outcome: Outcome | null;
  pnl_amount: number | null;
  pnl_percent: number | null;
  risk_amount?: number | null;
  r_multiple?: number | null;
};

export type AnalyticsFilters = {
  month?: string; 
  startIso?: string; 
  endIso?: string; 

  instruments?: string[];
  direction?: Direction | 'ALL';
  outcome?: Outcome | 'ALL';

  timeZone?: string; 
};

export type DailyPoint = {
  dayKey: string; 
  dateLabel: string;
  pnl: number;
  equity: number;
  ret: number; 
};

export type SymbolStat = {
  symbol: string;
  pnl: number;
  count: number;
  winRate: number;
};

export type CoreReport = {
  timeZone: string;
  startingBalance: number;
  endingBalance: number;

  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;

  netPnl: number;
  grossProfit: number;
  grossLossAbs: number;

  avgWin: number;
  avgLoss: number;
  rrr: number;
  expectancy: number;

  profitFactor: number;
  sharpe: number;

  maxDrawdown: number;
  maxDrawdownPct: number;

  bestDay: DailyPoint | null;
  worstDay: DailyPoint | null;

  daily: DailyPoint[];
  bySymbol: SymbolStat[];
};

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
  const [y, m] = month.split('-').map((x) => Number(x));
  const year = Number.isFinite(y) ? y : new Date().getUTCFullYear();
  const monthIndex = Number.isFinite(m) ? m - 1 : 0;

  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function filterTrades(trades: TradeRow[], f: AnalyticsFilters) {
  const dir = f.direction ?? 'ALL';
  const out = f.outcome ?? 'ALL';

  return trades.filter((t) => {
    const symbol = normalizeSymbol(t.instrument);

    if (!inInstrumentFilter(symbol, f.instruments)) return false;
    if (dir !== 'ALL' && t.direction !== dir) return false;
    if (out !== 'ALL' && t.outcome !== out) return false;

    if (f.startIso && t.opened_at < f.startIso) return false;
    if (f.endIso && t.opened_at >= f.endIso) return false;

    return true;
  });
}

export function computeReport(params: {
  trades: TradeRow[];
  startingBalance: number;
  timeZone?: string;
}): CoreReport {
  const timeZone = params.timeZone || 'UTC';
  const startingBalance = toNumberSafe(params.startingBalance, 0);

  const rows = params.trades.map((t) => ({
    ...t,
    instrument: normalizeSymbol(t.instrument),
    pnl_amount: toNumberSafe(t.pnl_amount, 0),
    pnl_percent: toNumberSafe(t.pnl_percent, 0),
  }));

  const totalTrades = rows.length;
  const winsArr = rows.filter((t) => t.outcome === 'WIN');
  const lossesArr = rows.filter((t) => t.outcome === 'LOSS');
  const beArr = rows.filter((t) => t.outcome === 'BREAKEVEN');

  const netPnl = rows.reduce((s, t) => s + toNumberSafe(t.pnl_amount, 0), 0);

  const grossProfit = winsArr.reduce(
    (s, t) => s + toNumberSafe(t.pnl_amount, 0),
    0,
  );

  const grossLossAbs = Math.abs(
    lossesArr.reduce((s, t) => s + toNumberSafe(t.pnl_amount, 0), 0),
  );

  const avgWin = winsArr.length ? grossProfit / winsArr.length : 0;

  const avgLoss = lossesArr.length
    ? lossesArr.reduce((s, t) => s + toNumberSafe(t.pnl_amount, 0), 0) /
      lossesArr.length
    : 0;

  const winRate = totalTrades ? (winsArr.length / totalTrades) * 100 : 0;
  const lossRate = totalTrades ? lossesArr.length / totalTrades : 0;

  const rrr = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : 0;

  const expectancy = totalTrades
    ? (winsArr.length / totalTrades) * avgWin + lossRate * avgLoss
    : 0;

  const profitFactor =
    grossLossAbs > 0
      ? grossProfit / grossLossAbs
      : grossProfit > 0
        ? Infinity
        : 0;

  const bySymbolMap = new Map<
    string,
    { pnl: number; count: number; wins: number }
  >();

  for (const t of rows) {
    const sym = t.instrument || '';
    if (!sym) continue;

    const prev = bySymbolMap.get(sym) ?? { pnl: 0, count: 0, wins: 0 };
    prev.pnl += toNumberSafe(t.pnl_amount, 0);
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
    const dayKey = fmtDayKey.format(d); 
    const label = fmtLabel.format(d);

    const prev = dailyMap.get(dayKey) ?? { pnl: 0, label };
    prev.pnl += toNumberSafe(t.pnl_amount, 0);
    dailyMap.set(dayKey, prev);
  }

  const dailyKeys = [...dailyMap.keys()].sort();

  let equity = startingBalance;
  const daily: DailyPoint[] = [];

  for (const k of dailyKeys) {
    const v = dailyMap.get(k);
    if (!v) continue;

    const prevEquity = equity;
    equity = equity + v.pnl;
    const ret = prevEquity !== 0 ? v.pnl / prevEquity : 0;

    daily.push({
      dayKey: k,
      dateLabel: v.label,
      pnl: v.pnl,
      equity,
      ret,
    });
  }

  const endingBalance = startingBalance + netPnl;

  const equitySeries = [startingBalance, ...daily.map((p) => p.equity)];
  const { maxDD, maxDDPct } = maxDrawdown(equitySeries);

  let bestDay: DailyPoint | null = null;
  let worstDay: DailyPoint | null = null;

  for (const d of daily) {
    if (!bestDay || d.pnl > bestDay.pnl) bestDay = d;
    if (!worstDay || d.pnl < worstDay.pnl) worstDay = d;
  }

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
    wins: winsArr.length,
    losses: lossesArr.length,
    breakeven: beArr.length,
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