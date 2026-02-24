'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';

type State = Pick<MonthlyReportState, 'report' | 'baseCurrency'>;

export function MonthlyReportDailyTable({ state: s }: { state: State }) {
  return (
    <section className='border rounded-xl p-4 space-y-3'>
      <h2 className='font-semibold'>Daily Results</h2>

      <div className='overflow-auto'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-left border-b'>
              <th className='p-2'>Day</th>
              <th className='p-2'>Daily P&amp;L</th>
              <th className='p-2'>Equity</th>
            </tr>
          </thead>
          <tbody>
            {s.report.daily.map((d) => (
              <tr key={d.dayKey} className='border-b'>
                <td className='p-2'>{d.dayKey}</td>
                <td className='p-2'>{formatMoney(d.pnl, s.baseCurrency)}</td>
                <td className='p-2'>{formatMoney(d.equity, s.baseCurrency)}</td>
              </tr>
            ))}

            {!s.report.daily.length && (
              <tr>
                <td className='p-2 opacity-70' colSpan={3}>
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