'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';

type State = Pick<MonthlyReportState, 'report' | 'baseCurrency'>;

export function MonthlyReportBestWorst({ state: s }: { state: State }) {
  return (
    <section className='space-y-4'>
      <h2 className='text-[20px] font-semibold tracking-[0.2px]'>
        Best / Worst Day
      </h2>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        <div className='relative rounded-xl border border-[var(--report-border)] bg-[var(--surface-elevated)] p-6'>
          <span
            aria-hidden='true'
            className='absolute bottom-4 left-0 top-4 w-[2px] rounded-full bg-[var(--profit)] opacity-70'
          />
          <div className='text-sm text-[var(--text-secondary)]'>Best Day</div>
          <div className='mt-1 text-xl font-semibold text-[var(--text-primary)]'>
            {s.report.bestDay ? s.report.bestDay.dayKey : '—'}
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-[var(--profit)] opacity-90'>
            {s.report.bestDay
              ? formatMoney(s.report.bestDay.pnl, s.baseCurrency)
              : '—'}
          </div>
        </div>

        <div className='rounded-xl border border-[var(--report-border)] bg-[var(--surface-elevated)] p-5'>
          <div className='text-sm text-[var(--text-secondary)]'>Worst Day</div>
          <div className='mt-1 text-xl font-semibold text-[var(--text-primary)]'>
            {s.report.worstDay ? s.report.worstDay.dayKey : '—'}
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-[var(--loss)]'>
            {s.report.worstDay
              ? formatMoney(s.report.worstDay.pnl, s.baseCurrency)
              : '—'}
          </div>
        </div>
      </div>
    </section>
  );
}
