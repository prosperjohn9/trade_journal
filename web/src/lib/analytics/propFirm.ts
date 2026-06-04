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
  worstDayLoss: number | null;
  worstDayDate: string | null;
  dailyLimitBreached: boolean;
  todayNet: number;

  tradingDays: number;
  minTradingDays: number | null;
  minDaysMet: boolean | null;

  status: 'passed' | 'breached' | 'in_progress';
};

function dayKeyUTC(iso: string): string {
  const d = new Date(iso);
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

  const pnlByDay = new Map<string, number>();
  for (const t of trades) {
    const k = dayKeyUTC(t.at);
    pnlByDay.set(k, (pnlByDay.get(k) ?? 0) + t.pnl);
  }
  const cashByDay = new Map<string, number>();
  for (const c of cashflows) {
    const k = dayKeyUTC(c.at);
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
  let worstDayLoss: number | null = null;
  let worstDayDate: string | null = null;
  for (const d of days) {
    running += (pnlByDay.get(d) ?? 0) + (cashByDay.get(d) ?? 0);
    if (running < minRunning) minRunning = running;
    if (pnlByDay.has(d)) {
      const dayPnl = pnlByDay.get(d) ?? 0;
      if (worstDayLoss == null || dayPnl < worstDayLoss) {
        worstDayLoss = dayPnl;
        worstDayDate = d;
      }
    }
  }

  const todayNet = pnlByDay.get(dayKeyUTC(new Date().toISOString())) ?? 0;

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
    rules.maxDrawdownPct != null
      ? startingBalance - (accountSize * rules.maxDrawdownPct) / 100
      : null;
  const drawdownBufferAmount =
    maxDrawdownFloor != null ? currentBalance - maxDrawdownFloor : null;
  const drawdownBufferPct =
    drawdownBufferAmount != null && accountSize > 0
      ? (drawdownBufferAmount / accountSize) * 100
      : null;
  const maxDrawdownBreached =
    maxDrawdownFloor != null ? minRunning <= maxDrawdownFloor : false;

  const dailyLossLimit =
    rules.dailyLossPct != null ? (accountSize * rules.dailyLossPct) / 100 : null;
  const dailyLimitBreached =
    dailyLossLimit != null && worstDayLoss != null
      ? worstDayLoss <= -dailyLossLimit
      : false;

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
