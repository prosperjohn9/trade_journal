'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';
import { signValueClass } from './monthly-report-ui';

type State = Pick<MonthlyReportState, 'report' | 'baseCurrency'>;

function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
  pad = 2,
) {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x =
        pad + (index * (width - pad * 2)) / Math.max(values.length - 1, 1);
      const y =
        pad + (1 - (value - min) / range) * (height - pad * 2);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function DailySparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return <span className='text-xs text-[var(--text-muted)]'>—</span>;
  }

  const width = 94;
  const height = 24;
  const path = buildSparklinePath(values, width, height, 2);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = width - 2;
  const y = 2 + (1 - (values[values.length - 1] - min) / range) * (height - 4);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className='h-6 w-[94px]'
      aria-hidden='true'>
      <path
        d={path}
        fill='none'
        stroke='var(--accent-progress)'
        strokeOpacity='0.72'
        strokeWidth='1.6'
        strokeLinecap='round'
      />
      <circle cx={x} cy={y} r='2' fill='var(--accent-progress)' fillOpacity='0.72' />
    </svg>
  );
}

export function MonthlyReportDailyTable({ state: s }: { state: State }) {
  return (
    <section className='space-y-4'>
      <h2 className='text-[20px] font-semibold tracking-[0.2px]'>
        Daily Breakdown
      </h2>

      <div className='overflow-auto rounded-xl border border-[var(--report-border)] bg-[var(--surface-elevated)]'>
        <table className='w-full min-w-[740px] text-sm'>
          <thead>
            <tr className='border-b border-[var(--report-divider)] text-xs uppercase tracking-wide text-[var(--text-secondary)]'>
              <th className='px-4 py-3 text-left font-semibold'>Day</th>
              <th className='px-4 py-3 text-right font-semibold'>Daily P&amp;L</th>
              <th className='px-4 py-3 text-right font-semibold'>Equity</th>
              <th className='px-4 py-3 text-right font-semibold'>7D Trend</th>
            </tr>
          </thead>

          <tbody>
            {s.report.daily.map((day, index) => {
              const sparklineValues = s.report.daily
                .slice(Math.max(0, index - 6), index + 1)
                .map((item) => item.equity);

              return (
                <tr
                  key={day.dayKey}
                  className='border-b border-[var(--report-divider)] odd:bg-[var(--table-zebra)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]'>
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
                  <td className='px-4 py-3.5 align-middle'>
                    <div className='flex h-full items-center justify-end'>
                      <DailySparkline values={sparklineValues} />
                    </div>
                  </td>
                </tr>
              );
            })}

            {!s.report.daily.length && (
              <tr>
                <td
                  className='px-4 py-4 text-center text-[var(--text-muted)]'
                  colSpan={4}>
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
