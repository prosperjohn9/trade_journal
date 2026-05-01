'use client';

import { apiFetch, buildQuery } from '@/src/lib/api/fetcher';
import type { CoreReport } from '@/src/lib/analytics/core';

export type MonthlyReportAccount = {
  id: string;
  name: string;
  starting_balance: number;
  base_currency: string | null;
  is_default: boolean;
};

export function getDefaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function loadMonthlyReport(params: {
  month: string;
  timeZone: string;
  accountId: string | 'all';
}) {
  const qs = buildQuery({
    month: params.month,
    timeZone: params.timeZone,
    accountId: params.accountId,
  });
  return apiFetch<{
    profile: Record<string, unknown>;
    accounts: MonthlyReportAccount[];
    selectedAccount: MonthlyReportAccount | null;
    baseCurrency: string;
    hasStartingBalance: boolean;
    priorNetPnl: number;
    monthStartingBalance: number | null;
    trades: unknown[];
    report: CoreReport;
  }>(`/api/monthly-report${qs}`);
}
