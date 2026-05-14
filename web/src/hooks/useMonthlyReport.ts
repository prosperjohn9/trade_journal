'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { getErr } from '@/src/domain/errors';
import {
  getDefaultMonth,
  loadMonthlyReport,
} from '@/src/lib/services/monthlyReport.service';
import type { CoreReport } from '@/src/lib/analytics/core';

export function useMonthlyReport() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [month, _setMonth] = useState<string>(
    () => searchParams.get('month') ?? getDefaultMonth(),
  );
  const [accountId, _setAccountId] = useState<string | 'all'>(
    () => (searchParams.get('account') as string | null) ?? 'all',
  );

  const writeUrl = useCallback(
    (next: { month?: string; account?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.month !== undefined) params.set('month', next.month);
      if (next.account !== undefined) {
        if (next.account === 'all') params.delete('account');
        else params.set('account', next.account);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setMonth = useCallback(
    (m: string) => {
      _setMonth(m);
      writeUrl({ month: m });
    },
    [writeUrl],
  );

  const setAccountId = useCallback(
    (a: string) => {
      _setAccountId(a);
      writeUrl({ account: a });
    },
    [writeUrl],
  );

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
