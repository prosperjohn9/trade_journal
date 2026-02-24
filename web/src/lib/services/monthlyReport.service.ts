import { requireUser } from '@/src/lib/supabase/auth';
import { getOrCreateProfile } from '@/src/lib/db/profiles.repo';
import { fetchAccountsByUser } from '@/src/lib/db/accounts.repo';
import {
  fetchTradesBeforeMonth,
  fetchTradesForMonth,
} from '@/src/lib/db/trades.repo';
import { toNumberSafe } from '@/src/lib/utils/number';
import { computeReport, type TradeRow } from '@/src/lib/analytics/core';

type TradeNetFields = {
  pnl_amount?: unknown;
  pnl_percent?: unknown;
  commission?: unknown;
  net_pnl?: unknown;
  reviewed_at?: unknown;
};

export function calcNetPnl(row: TradeNetFields): {
  netPnl: number;
  netPct: number;
} {
  const gross = Number(row.pnl_amount ?? 0);
  const grossPct = Number(row.pnl_percent ?? 0);

  const reviewed = !!row.reviewed_at;

  const grossSafe = Number.isFinite(gross) ? gross : 0;
  const grossPctSafe = Number.isFinite(grossPct) ? grossPct : 0;

  if (!reviewed) return { netPnl: grossSafe, netPct: grossPctSafe };

  const commissionRaw = Number(row.commission ?? 0);
  const commission = Number.isFinite(commissionRaw) ? commissionRaw : 0;

  const netStored = Number(row.net_pnl);
  const netPnl = Number.isFinite(netStored)
    ? netStored
    : grossSafe - commission;

  const netPct =
    grossSafe !== 0 ? (grossPctSafe * netPnl) / grossSafe : grossPctSafe;

  return {
    netPnl: Number.isFinite(netPnl) ? netPnl : 0,
    netPct: Number.isFinite(netPct) ? netPct : 0,
  };
}

export function getDefaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function loadMonthlyReport(params: {
  month: string;
  timeZone: string;
  accountId: string | 'all';
}) {
  await requireUser();

  const { userId, profile } = await getOrCreateProfile();
  const accounts = await fetchAccountsByUser(userId);

  const selectedAccount =
    params.accountId === 'all'
      ? null
      : (accounts.find((a) => a.id === params.accountId) ?? null);

  const baseCurrency =
    selectedAccount?.base_currency ?? profile.base_currency ?? 'USD';

  const allAccountsStartingBalance = accounts.reduce(
    (acc, a) => acc + toNumberSafe(a.starting_balance, 0),
    0,
  );

  const hasStartingBalance =
    params.accountId === 'all'
      ? true
      : selectedAccount?.starting_balance !== null &&
        selectedAccount?.starting_balance !== undefined;

  const monthRows = await fetchTradesForMonth({
    userId,
    month: params.month,
    accountId: params.accountId,
  });

  const trades: TradeRow[] = monthRows.map((r) => {
    const { netPnl, netPct } = calcNetPnl(r);
    return {
      id: r.id,
      opened_at: r.opened_at,
      instrument: r.instrument,
      direction: r.direction,
      outcome: r.outcome,
      pnl_amount: netPnl,
      pnl_percent: netPct,
      risk_amount: r.risk_amount,
      r_multiple: r.r_multiple,
    };
  });

  let priorNetPnl = 0;
  if (hasStartingBalance) {
    const priorRows = await fetchTradesBeforeMonth({
      userId,
      month: params.month,
      accountId: params.accountId,
    });

    priorNetPnl = priorRows.reduce(
      (acc, row) => acc + calcNetPnl(row).netPnl,
      0,
    );
  }

  const selectedStartingBalance = selectedAccount
    ? toNumberSafe(selectedAccount.starting_balance, 0)
    : 0;

  const monthStartingBalance =
    params.accountId === 'all'
      ? allAccountsStartingBalance + priorNetPnl
      : hasStartingBalance
        ? selectedStartingBalance + priorNetPnl
        : null;

  const report = computeReport({
    trades,
    startingBalance: monthStartingBalance ?? 0,
    timeZone: params.timeZone,
  });

  return {
    profile,
    accounts,
    selectedAccount,
    baseCurrency,
    hasStartingBalance,
    priorNetPnl,
    monthStartingBalance,
    trades,
    report,
  };
}