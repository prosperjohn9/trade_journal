'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErr } from '@/src/domain/errors';
import {
  getDefaultMonth,
  loadMonthlyReport,
} from '@/src/lib/services/monthlyReport.service';
import type { CoreReport } from '@/src/lib/analytics/core';
import type { AccountRow } from '@/src/lib/db/accounts.repo';

export function useMonthlyReport() {
  const router = useRouter();

  const [month, setMonth] = useState(getDefaultMonth);
  const [accountId, setAccountId] = useState<string | 'all'>('all');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingPrior, setLoadingPrior] = useState(false);
  const [msg, setMsg] = useState('');

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );

  const [data, setData] = useState<{
    baseCurrency: string;
    monthStartingBalance: number | null;
    hasStartingBalance: boolean;
    report: CoreReport;
    selectedAccount: AccountRow | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setMsg('');
      setLoadingPrior(true);

      try {
        const res = await loadMonthlyReport({ month, timeZone, accountId });
        if (cancelled) return;

        setAccounts(res.accounts);

        setData({
          baseCurrency: res.baseCurrency,
          monthStartingBalance: res.monthStartingBalance,
          hasStartingBalance: res.hasStartingBalance,
          report: res.report,
          selectedAccount: res.selectedAccount,
        });
      } catch (e: unknown) {
        if (!cancelled) {
          setMsg(getErr(e, 'Failed to load monthly report'));
          router.push('/auth');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingPrior(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [month, timeZone, accountId, router]);

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

    accounts,
    accountId,
    setAccountId,

    loading,
    loadingPrior,
    msg,

    baseCurrency: data?.baseCurrency ?? 'USD',
    monthStartingBalance: data?.monthStartingBalance ?? null,
    hasStartingBalance: data?.hasStartingBalance ?? true,
    selectedAccount: data?.selectedAccount ?? null,
    report: data?.report ?? emptyReport,
  };
}

export type MonthlyReportState = ReturnType<typeof useMonthlyReport>;