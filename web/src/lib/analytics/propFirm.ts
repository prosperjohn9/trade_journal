// Prop-firm challenge tracking. Pure and server/client-usable. Computes a
// funded account's status (profit target, max drawdown, daily loss limit,
// minimum trading days, pass/fail) from its starting balance, trades, and any
// deposit/withdrawal events.
//
// v1 assumes a STATIC max drawdown (floor fixed at start) and groups days in
// UTC. Trailing drawdown and broker-specific daily reset times are future work.

export type PropRules = {
  firm?: string;
  accountSize?: number; // defaults to the account's starting balance
  phase?: string; // "Phase 1" | "Phase 2" | "Funded" | ...
  profitTargetPct?: number; // % of account size
  maxDrawdownPct?: number; // % of account size (overall loss floor)
  maxDrawdownType?: 'static' | 'trailing';
  dailyLossPct?: number; // % of account size (single-day loss limit)
  minTradingDays?: number;
  dailyResetHourUtc?: number; // 0-23; UTC hour the trading day resets (default 0)
};

export type PropTrade = { at: string; pnl: number };
export type PropCashflow = { at: string; amount: number }; // signed: +deposit, -withdrawal

export type PropStatus = {
  accountSize: number;
  netProfit: number;
  currentBalance: number;

  profitTargetAmount: number | null;
  profitProgressPct: number | null;
  targetMet: boolean;

  maxDrawdownFloor: number | null;
  drawdownBufferAmount: number | null;
  drawdownBufferPct: number | null;
  maxDrawdownBreached: boolean;

  dailyLossLimit: number | null;
  dailyRemainingToday: number | null;
  worstDayLoss: number | null;
  worstDayDate: string | null;
  dailyLimitBreached: boolean;
  todayNet: number;

  tradingDays: number;
  minTradingDays: number | null;
  minDaysMet: boolean | null;

  status: 'passed' | 'breached' | 'in_progress';
};

function dayKeyUTC(iso: string, resetHourUtc = 0): string {
  // Shift the clock back by the reset hour so each prop "trading day" runs from
  // its reset time to the next, then label it by that shifted UTC date.
  const shiftMs = (((resetHourUtc % 24) + 24) % 24) * 3_600_000;
  const d = new Date(new Date(iso).getTime() - shiftMs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function computePropStatus(params: {
  startingBalance: number;
  rules: PropRules;
  trades: PropTrade[];
  cashflows?: PropCashflow[];
}): PropStatus {
  const { startingBalance, rules } = params;
  const trades = params.trades;
  const cashflows = params.cashflows ?? [];

  const accountSize =
    rules.accountSize && rules.accountSize > 0 ? rules.accountSize : startingBalance;
  const resetHour = rules.dailyResetHourUtc ?? 0;
  const trailing = rules.maxDrawdownType === 'trailing';
  const maxDdAmount =
    rules.maxDrawdownPct != null ? (accountSize * rules.maxDrawdownPct) / 100 : null;
  // Daily loss is a FIXED amount: the % of ACCOUNT SIZE (5% of 10k = 500),
  // applied to each day's starting balance (day floor = dayStart - dailyAmount).
  const dailyAmount =
    rules.dailyLossPct != null ? (accountSize * rules.dailyLossPct) / 100 : null;

  const pnlByDay = new Map<string, number>();
  for (const t of trades) {
    const k = dayKeyUTC(t.at, resetHour);
    pnlByDay.set(k, (pnlByDay.get(k) ?? 0) + t.pnl);
  }
  const cashByDay = new Map<string, number>();
  for (const c of cashflows) {
    const k = dayKeyUTC(c.at, resetHour);
    cashByDay.set(k, (cashByDay.get(k) ?? 0) + c.amount);
  }

  const netProfit = trades.reduce((s, t) => s + t.pnl, 0);
  const totalCash = cashflows.reduce((s, c) => s + c.amount, 0);
  const currentBalance = startingBalance + netProfit + totalCash;

  // Walk days chronologically to find the lowest running balance (static
  // drawdown breach) and the worst single trading day (daily-limit breach).
  const days = [...new Set([...pnlByDay.keys(), ...cashByDay.keys()])].sort();
  let running = startingBalance;
  let minRunning = startingBalance;
  let peak = startingBalance;
  let trailingBreached = false;
  let dailyBreached = false;
  let worstDayLoss: number | null = null;
  let worstDayDate: string | null = null;
  for (const d of days) {
    const dayPnl = pnlByDay.get(d) ?? 0;
    const dayCash = cashByDay.get(d) ?? 0;
    // A day breaches if its loss exceeds the fixed daily amount (balance drops
    // below dayStart - dailyAmount).
    if (dailyAmount != null && -dayPnl > dailyAmount) dailyBreached = true;
    running += dayPnl + dayCash;
    if (running > peak) peak = running;
    if (running < minRunning) minRunning = running;
    if (maxDdAmount != null && running <= peak - maxDdAmount) {
      trailingBreached = true;
    }
    if (pnlByDay.has(d)) {
      if (worstDayLoss == null || dayPnl < worstDayLoss) {
        worstDayLoss = dayPnl;
        worstDayDate = d;
      }
    }
  }

  const todayKey = dayKeyUTC(new Date().toISOString(), resetHour);
  const todayNet = pnlByDay.get(todayKey) ?? 0;
  const todayCash = cashByDay.get(todayKey) ?? 0;
  const todayStartBalance = currentBalance - todayNet - todayCash;

  const profitTargetAmount =
    rules.profitTargetPct != null
      ? (accountSize * rules.profitTargetPct) / 100
      : null;
  const profitProgressPct =
    profitTargetAmount && profitTargetAmount > 0
      ? (netProfit / profitTargetAmount) * 100
      : null;
  const targetMet =
    profitTargetAmount != null ? netProfit >= profitTargetAmount : false;

  const maxDrawdownFloor =
    maxDdAmount != null ? (trailing ? peak : startingBalance) - maxDdAmount : null;
  const drawdownBufferAmount =
    maxDrawdownFloor != null ? currentBalance - maxDrawdownFloor : null;
  const drawdownBufferPct =
    drawdownBufferAmount != null && accountSize > 0
      ? (drawdownBufferAmount / accountSize) * 100
      : null;
  const maxDrawdownBreached =
    maxDdAmount == null
      ? false
      : trailing
        ? trailingBreached
        : minRunning <= startingBalance - maxDdAmount;

  // Limit is the fixed daily amount. "Remaining today" is how much can still be
  // lost before hitting today's daily floor OR the overall floor, whichever
  // binds first (e.g. near the overall floor the daily room shrinks).
  const dailyLossLimit = dailyAmount;
  const dailyLimitBreached = dailyBreached;
  const dailyTodayFloor =
    dailyAmount != null ? todayStartBalance - dailyAmount : null;
  const dailyRemainingToday =
    dailyTodayFloor != null
      ? Math.max(
          0,
          currentBalance - Math.max(dailyTodayFloor, maxDrawdownFloor ?? -Infinity),
        )
      : null;

  const tradingDays = pnlByDay.size;
  const minTradingDays = rules.minTradingDays ?? null;
  const minDaysMet =
    minTradingDays != null ? tradingDays >= minTradingDays : null;

  const status: PropStatus['status'] =
    maxDrawdownBreached || dailyLimitBreached
      ? 'breached'
      : targetMet && (minDaysMet ?? true)
        ? 'passed'
        : 'in_progress';

  return {
    accountSize,
    netProfit,
    currentBalance,
    profitTargetAmount,
    profitProgressPct,
    targetMet,
    maxDrawdownFloor,
    drawdownBufferAmount,
    drawdownBufferPct,
    maxDrawdownBreached,
    dailyLossLimit,
    dailyRemainingToday,
    worstDayLoss,
    worstDayDate,
    dailyLimitBreached,
    todayNet,
    tradingDays,
    minTradingDays,
    minDaysMet,
    status,
  };
}

export type PropQuickStatus = {
  accountSize: number;
  netProfit: number;
  currentBalance: number;
  profitTargetAmount: number | null;
  profitProgressPct: number | null;
  targetMet: boolean;
  maxDrawdownFloor: number | null;
  drawdownBufferAmount: number | null;
  drawdownBufferPct: number | null;
};

/** Lightweight current-state status from aggregates only (no per-day data), for
 *  the account-card summary. Uses the static drawdown floor; the full modal does
 *  trailing + historical breach detection. */
export function computePropQuickStatus(params: {
  startingBalance: number;
  netProfit: number;
  netCashflow?: number;
  rules: PropRules;
}): PropQuickStatus {
  const { startingBalance, netProfit, rules } = params;
  const accountSize =
    rules.accountSize && rules.accountSize > 0 ? rules.accountSize : startingBalance;
  const currentBalance = startingBalance + netProfit + (params.netCashflow ?? 0);

  const profitTargetAmount =
    rules.profitTargetPct != null ? (accountSize * rules.profitTargetPct) / 100 : null;
  const profitProgressPct =
    profitTargetAmount && profitTargetAmount > 0
      ? (netProfit / profitTargetAmount) * 100
      : null;
  const targetMet =
    profitTargetAmount != null ? netProfit >= profitTargetAmount : false;

  const maxDdAmount =
    rules.maxDrawdownPct != null ? (accountSize * rules.maxDrawdownPct) / 100 : null;
  const maxDrawdownFloor = maxDdAmount != null ? startingBalance - maxDdAmount : null;
  const drawdownBufferAmount =
    maxDrawdownFloor != null ? currentBalance - maxDrawdownFloor : null;
  const drawdownBufferPct =
    drawdownBufferAmount != null && accountSize > 0
      ? (drawdownBufferAmount / accountSize) * 100
      : null;

  return {
    accountSize,
    netProfit,
    currentBalance,
    profitTargetAmount,
    profitProgressPct,
    targetMet,
    maxDrawdownFloor,
    drawdownBufferAmount,
    drawdownBufferPct,
  };
}
