'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';
import {
  formatSignedPercent,
  LineChart,
  signValueClass,
  volatilityLabel,
} from './monthly-report-ui';

type State = Pick<MonthlyReportState, 'report' | 'baseCurrency'>;

export function MonthlyReportEquitySection({ state: s }: { state: State }) {
  const totalReturnPct =
    s.report.startingBalance !== 0
      ? (s.report.netPnl / s.report.startingBalance) * 100
      : 0;

  const maxDrawdownPct = s.report.maxDrawdownPct * 100;
  const volatility = volatilityLabel(s.report.daily.map((d) => d.ret));

  return (
    <section className='space-y-4'>
      <h2 className='text-xl font-semibold'>Equity Overview</h2>

      <div className='rounded-2xl bg-[var(--bg-subtle)] px-5 py-6 md:py-8'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h3 className='text-lg font-semibold text-[var(--text-primary)]'>
              Equity Curve
            </h3>
          </div>

          <div className='text-right text-sm text-[var(--text-secondary)]'>
            <div>
              Start: {formatMoney(s.report.startingBalance, s.baseCurrency)}
            </div>
            <div>End: {formatMoney(s.report.endingBalance, s.baseCurrency)}</div>
          </div>
        </div>

        <div className='mt-5'>
          <LineChart
            values={[
              s.report.startingBalance,
              ...s.report.daily.map((point) => point.equity),
            ]}
            labels={['Start', ...s.report.daily.map((point) => point.dateLabel)]}
            height={300}
          />
        </div>

        <div className='mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--text-secondary)]'>
          <span>
            Total Return:{' '}
            <strong className={signValueClass(totalReturnPct)}>
              {formatSignedPercent(totalReturnPct, 2)}
            </strong>
          </span>
          <span>
            Max Drawdown:{' '}
            <strong className='text-[var(--loss)]'>
              {formatSignedPercent(-Math.abs(maxDrawdownPct), 2)}
            </strong>
          </span>
          <span>
            Volatility:{' '}
            <strong className='text-[var(--text-primary)]'>{volatility}</strong>
          </span>
        </div>
      </div>
    </section>
  );
}
