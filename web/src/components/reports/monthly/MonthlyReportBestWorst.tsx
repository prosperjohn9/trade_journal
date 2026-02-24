'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';

type State = Pick<MonthlyReportState, 'report' | 'baseCurrency'>;

export function MonthlyReportBestWorst({ state: s }: { state: State }) {
  return (
    <section className='border rounded-xl p-4 space-y-3'>
      <h2 className='font-semibold'>Best / Worst Day</h2>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        <div className='border rounded-xl p-4'>
          <div className='text-sm opacity-70'>Best day</div>
          <div className='text-lg font-semibold'>
            {s.report.bestDay ? s.report.bestDay.dayKey : '—'}
          </div>
          <div className='opacity-80'>
            {s.report.bestDay
              ? formatMoney(s.report.bestDay.pnl, s.baseCurrency)
              : '—'}
          </div>
        </div>

        <div className='border rounded-xl p-4'>
          <div className='text-sm opacity-70'>Worst day</div>
          <div className='text-lg font-semibold'>
            {s.report.worstDay ? s.report.worstDay.dayKey : '—'}
          </div>
          <div className='opacity-80'>
            {s.report.worstDay
              ? formatMoney(s.report.worstDay.pnl, s.baseCurrency)
              : '—'}
          </div>
        </div>
      </div>
    </section>
  );
}