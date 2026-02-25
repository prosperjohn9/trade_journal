'use client';

import { useEffect, useState } from 'react';
import { useMonthlyReport } from '@/src/hooks/useMonthlyReport';
import { MonthlyReportHeader } from './MonthlyReportHeader';
import { MonthlyReportEquitySection } from './MonthlyReportEquitySection';
import { MonthlyReportPerformanceCards } from './MonthlyReportPerformanceCards';
import { MonthlyReportBestWorst } from './MonthlyReportBestWorst';
import { MonthlyReportBestSymbolsTable } from './MonthlyReportBestSymbolsTable';
import { MonthlyReportDailyTable } from './MonthlyReportDailyTable';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

export function MonthlyReportClient() {
  const s = useMonthlyReport();
  const [theme, setTheme] = useState<DashboardTheme>('light');

  const showStartingBalanceTip = s.accountId !== 'all' && !s.hasStartingBalance;

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved);
        return;
      }

      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      setTheme(prefersDark ? 'dark' : 'light');
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto w-full max-w-[1280px] space-y-12 px-4 py-8 sm:px-6 lg:px-8'>
        <MonthlyReportHeader state={s} />

        {showStartingBalanceTip && (
          <p className='rounded-xl border border-[var(--report-border)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-secondary)]'>
            <span className='font-semibold text-[var(--text-primary)]'>Tip:</span>{' '}
            Set a{' '}
            <span className='font-semibold text-[var(--text-primary)]'>
              Starting Balance
            </span>{' '}
            for this account to make your equity curve and drawdown meaningful.
          </p>
        )}

        {s.loading && (
          <p className='text-sm text-[var(--text-secondary)]'>Loading report...</p>
        )}

        {s.msg && (
          <p className='rounded-xl border border-[var(--report-border)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--loss)]'>
            {s.msg}
          </p>
        )}

        {!s.loading && (
          <>
            <MonthlyReportEquitySection state={s} />
            <MonthlyReportPerformanceCards state={s} />
            <MonthlyReportBestWorst state={s} />
            <MonthlyReportBestSymbolsTable state={s} />
            <MonthlyReportDailyTable state={s} />
          </>
        )}
      </div>
    </main>
  );
}
