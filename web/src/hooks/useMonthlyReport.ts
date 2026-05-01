'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { getErr } from '@/src/domain/errors';
import {
  getDefaultMonth,
  loadMonthlyReport,
} from '@/src/lib/services/monthlyReport.service';
import type { CoreReport } from '@/src/lib/analytics/core';

export function useMonthlyReport() {
  const router = useRouter();

  const [month, setMonth] = useState(getDefaultMonth);
  const [accountId, setAccountId] = useState<string | 'all'>('all');

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );

  const { data, error, isLoading } = useSWR(
    ['monthly-report', month, timeZone, accountId],
    () => loadMonthlyReport({ month, timeZone, accountId }),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  if (error) {
    const message = getErr(error, 'Failed to load monthly report');
    if (message.toLowerCase().includes('not authenticated')) {
      router.push('/auth');
    }
  }

  const emptyReport: CoreReport = {
    timeZone,
    startingBalance: 0,
    endingBalance: 0,

    totalTrades: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    winRate: 0,

    netPnl: 0,
    grossProfit: 0,
    grossLossAbs: 0,

    avgWin: 0,
    avgLoss: 0,
    rrr: 0,
    expectancy: 0,

    profitFactor: 0,
    sharpe: 0,

    maxDrawdown: 0,
    maxDrawdownPct: 0,

    bestDay: null,
    worstDay: null,

    daily: [],
    bySymbol: [],
  };

  return {
    month,
    setMonth,

    accounts: data?.accounts ?? [],
    accountId,
    setAccountId,

    loading: isLoading,
    loadingPrior: isLoading,
    msg: error ? getErr(error, 'Failed to load monthly report') : '',

    baseCurrency: data?.baseCurrency ?? 'USD',
    monthStartingBalance: data?.monthStartingBalance ?? null,
    hasStartingBalance: data?.hasStartingBalance ?? true,
    selectedAccount: data?.selectedAccount ?? null,
    report: data?.report ?? emptyReport,
  };
}

export type MonthlyReportState = ReturnType<typeof useMonthlyReport>;
