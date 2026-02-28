'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';
import {
  type EquityChartPoint,
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
  const chartPoints: EquityChartPoint[] = [
    {
      dayKey: 'Start',
      xLabel: 'Start',
      equity: s.report.startingBalance,
      dayNet: 0,
      cumNet: 0,
    },
    ...s.report.daily.map((point) => ({
      dayKey: point.dayKey,
      xLabel: point.dateLabel,
      equity: point.equity,
      dayNet: point.pnl,
      cumNet: point.equity - s.report.startingBalance,
    })),
  ];

  return (
    <section className='space-y-6'>
      <h2 className='text-[20px] font-semibold tracking-[0.2px]'>
        Equity Overview
      </h2>

      <div className='rounded-2xl bg-[var(--bg-subtle)] px-5 py-7 md:px-6 md:py-9'>
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
            points={chartPoints}
            startingBalance={s.report.startingBalance}
            currency={s.baseCurrency}
            height={320}
          />
        </div>

        <div className='mt-5 flex flex-wrap items-center gap-2.5'>
          <span className='inline-flex items-center rounded-full border border-[var(--report-border)] bg-[var(--surface-elevated)] px-3 py-1 text-[13px] font-semibold text-[var(--text-secondary)]'>
            <strong className={signValueClass(totalReturnPct)}>
              {formatSignedPercent(totalReturnPct, 2)}
            </strong>
            <span className='ml-1.5'>Return</span>
          </span>

          <span className='inline-flex items-center rounded-full border border-[var(--report-border)] bg-[var(--surface-elevated)] px-3 py-1 text-[13px] font-semibold text-[var(--text-secondary)]'>
            <strong className='text-[var(--loss)]'>
              {formatSignedPercent(-Math.abs(maxDrawdownPct), 2)}
            </strong>
            <span className='ml-1.5'>DD</span>
          </span>

          <span className='inline-flex items-center rounded-full border border-[var(--report-border)] bg-[var(--surface-muted)] px-3 py-1 text-[13px] font-semibold text-[var(--text-secondary)]'>
            <strong className='text-[var(--text-secondary)]'>{volatility}</strong>
            <span className='ml-1.5'>Volatility</span>
          </span>
        </div>
      </div>
    </section>
  );
}