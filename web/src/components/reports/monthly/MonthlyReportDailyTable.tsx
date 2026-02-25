'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';
import { signValueClass } from './monthly-report-ui';

type State = Pick<MonthlyReportState, 'report' | 'baseCurrency'>;

export function MonthlyReportDailyTable({ state: s }: { state: State }) {
  return (
    <section className='space-y-4'>
      <h2 className='text-xl font-semibold'>Daily Breakdown</h2>

      <div className='overflow-auto rounded-xl border border-[var(--table-divider)] bg-[var(--surface-elevated)]'>
        <table className='w-full min-w-[620px] text-sm'>
          <thead>
            <tr className='border-b border-[var(--table-divider)] text-xs uppercase tracking-wide text-[var(--text-secondary)]'>
              <th className='px-4 py-3 text-left font-semibold'>Day</th>
              <th className='px-4 py-3 text-right font-semibold'>Daily P&amp;L</th>
              <th className='px-4 py-3 text-right font-semibold'>Equity</th>
            </tr>
          </thead>

          <tbody>
            {s.report.daily.map((day) => (
              <tr
                key={day.dayKey}
                className='border-b border-[var(--table-divider)] bg-[var(--table-row-bg)] odd:bg-[var(--table-zebra)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--table-row-hover)]'>
                <td className='px-4 py-3.5 font-medium text-[var(--text-primary)]'>
                  {day.dayKey}
                </td>
                <td
                  className={`px-4 py-3.5 text-right font-semibold tabular-nums ${signValueClass(day.pnl)}`}>
                  {formatMoney(day.pnl, s.baseCurrency)}
                </td>
                <td className='px-4 py-3.5 text-right font-semibold tabular-nums text-[var(--text-primary)]'>
                  {formatMoney(day.equity, s.baseCurrency)}
                </td>
              </tr>
            ))}

            {!s.report.daily.length && (
              <tr>
                <td
                  className='px-4 py-4 text-center text-[var(--text-muted)]'
                  colSpan={3}>
                  No daily data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
