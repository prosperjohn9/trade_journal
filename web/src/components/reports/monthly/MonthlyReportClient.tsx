'use client';

import { useMonthlyReport } from '@/src/hooks/useMonthlyReport';
import { MonthlyReportHeader } from './MonthlyReportHeader';
import { MonthlyReportMonthPicker } from './MonthlyReportMonthPicker';
import { MonthlyReportEquitySection } from './MonthlyReportEquitySection';
import { MonthlyReportPerformanceCards } from './MonthlyReportPerformanceCards';
import { MonthlyReportBestWorst } from './MonthlyReportBestWorst';
import { MonthlyReportBestSymbolsTable } from './MonthlyReportBestSymbolsTable';
import { MonthlyReportDailyTable } from './MonthlyReportDailyTable';

export function MonthlyReportClient() {
  const s = useMonthlyReport();

  const showStartingBalanceTip = s.accountId !== 'all' && !s.hasStartingBalance;

  return (
    <main className='p-6 space-y-6'>
      <MonthlyReportHeader />

      <MonthlyReportMonthPicker state={s} />

      {showStartingBalanceTip && (
        <p className='text-sm opacity-80'>
          <span className='font-semibold'>Tip:</span> Set a{' '}
          <span className='font-semibold'>Starting Balance</span> for this
          account to make your equity curve and drawdown meaningful.
        </p>
      )}

      {s.loading && <p className='opacity-80'>Loading…</p>}
      {s.msg && <p className='text-sm text-rose-700'>{s.msg}</p>}

      {!s.loading && (
        <>
          <MonthlyReportEquitySection state={s} />
          <MonthlyReportPerformanceCards state={s} />
          <MonthlyReportBestWorst state={s} />
          <MonthlyReportBestSymbolsTable state={s} />
          <MonthlyReportDailyTable state={s} />
        </>
      )}
    </main>
  );
}