'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';

type State = Pick<MonthlyReportState, 'report' | 'baseCurrency'>;

export function MonthlyReportBestSymbolsTable({ state: s }: { state: State }) {
  return (
    <section className='border rounded-xl p-4 space-y-3'>
      <h2 className='font-semibold'>Best Performing Symbols</h2>

      <div className='overflow-auto'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-left border-b'>
              <th className='p-2'>Symbol</th>
              <th className='p-2'>Trades</th>
              <th className='p-2'>Win Rate</th>
              <th className='p-2'>Net P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {s.report.bySymbol.map((r) => (
              <tr key={r.symbol} className='border-b'>
                <td className='p-2 font-semibold'>{r.symbol}</td>
                <td className='p-2'>{r.count}</td>
                <td className='p-2'>{r.winRate.toFixed(1)}%</td>
                <td className='p-2'>{formatMoney(r.pnl, s.baseCurrency)}</td>
              </tr>
            ))}

            {!s.report.bySymbol.length && (
              <tr>
                <td className='p-2 opacity-70' colSpan={4}>
                  No trades for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}