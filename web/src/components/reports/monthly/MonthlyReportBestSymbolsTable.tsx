'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';
import { formatNumber, signValueClass } from './monthly-report-ui';

type State = Pick<MonthlyReportState, 'report' | 'baseCurrency'>;

export function MonthlyReportBestSymbolsTable({ state: s }: { state: State }) {
  return (
    <section className='space-y-4'>
      <h2 className='text-[20px] font-semibold tracking-[0.2px]'>
        Symbol Breakdown
      </h2>

      <div className='overflow-auto rounded-xl border border-[var(--report-border)] bg-[var(--surface-elevated)]'>
        <table className='w-full min-w-[560px] text-sm'>
          <thead>
            <tr className='border-b border-[var(--report-divider)] bg-[var(--bg-subtle)] text-xs uppercase tracking-wide text-[var(--text-secondary)]'>
              <th className='px-4 py-3 text-left font-semibold'>Symbol</th>
              <th className='px-4 py-3 text-right font-semibold'>Trades</th>
              <th className='px-4 py-3 text-right font-semibold'>Win Rate</th>
              <th className='px-4 py-3 text-right font-semibold'>Net P&amp;L</th>
            </tr>
          </thead>

          <tbody>
            {s.report.bySymbol.map((row) => (
              <tr
                key={row.symbol}
                className='border-b border-[var(--report-divider)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--table-row-hover)]'>
                <td className='px-4 py-3.5 font-semibold text-[var(--text-primary)]'>
                  {row.symbol}
                </td>
                <td className='px-4 py-3.5 text-right tabular-nums'>
                  {formatNumber(row.count, 0)}
                </td>
                <td className='px-4 py-3.5 text-right tabular-nums'>
                  {formatNumber(row.winRate, 1)}%
                </td>
                <td
                  className={`px-4 py-3.5 text-right font-semibold tabular-nums ${signValueClass(row.pnl)}`}>
                  {formatMoney(row.pnl, s.baseCurrency)}
                </td>
              </tr>
            ))}

            {!s.report.bySymbol.length && (
              <tr>
                <td
                  className='px-4 py-4 text-center text-[var(--text-muted)]'
                  colSpan={4}>
                  No symbol data for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
