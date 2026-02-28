'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';
import {
  formatNumber,
  ReportMetricCard,
  signValueClass,
} from './monthly-report-ui';

type State = Pick<MonthlyReportState, 'report' | 'baseCurrency'>;

export function MonthlyReportPerformanceCards({ state: s }: { state: State }) {
  const profitFactor = Number.isFinite(s.report.profitFactor)
    ? s.report.profitFactor.toFixed(2)
    : '∞';

  return (
    <>
      <section className='space-y-4'>
        <h2 className='text-[20px] font-semibold tracking-[0.2px]'>
          Core Metrics
        </h2>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <ReportMetricCard
            title='Total P&L'
            value={formatMoney(s.report.netPnl, s.baseCurrency)}
            valueClassName={signValueClass(s.report.netPnl)}
            emphasized
          />

          <ReportMetricCard
            title='Win Rate'
            value={`${formatNumber(s.report.winRate, 1)}%`}
          />

          <ReportMetricCard
            title='Max DD'
            value={formatMoney(Math.abs(s.report.maxDrawdown), s.baseCurrency)}
            valueClassName='text-[var(--text-primary)]'
            caption={
              <span className='text-[var(--loss)]'>
                Drawdown {formatMoney(-Math.abs(s.report.maxDrawdown), s.baseCurrency)}
              </span>
            }
          />

          <ReportMetricCard title='Profit Factor' value={profitFactor} />
        </div>
      </section>

      <section className='space-y-4'>
        <h2 className='text-[20px] font-semibold tracking-[0.2px]'>
          Risk &amp; Performance Metrics
        </h2>
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          <ReportMetricCard
            title='Avg Win'
            value={formatMoney(s.report.avgWin, s.baseCurrency)}
            valueClassName={signValueClass(s.report.avgWin)}
            compact
            muted
          />

          <ReportMetricCard
            title='Avg Loss'
            value={formatMoney(s.report.avgLoss, s.baseCurrency)}
            valueClassName='text-[var(--loss)]'
            compact
            muted
          />

          <ReportMetricCard
            title='RRR'
            value={formatNumber(s.report.rrr, 2)}
            compact
            muted
          />

          <ReportMetricCard
            title='Expectancy'
            value={formatMoney(s.report.expectancy, s.baseCurrency)}
            valueClassName={signValueClass(s.report.expectancy)}
            compact
            muted
          />

          <ReportMetricCard
            title='Sharpe'
            value={formatNumber(s.report.sharpe, 2)}
            compact
            muted
          />

          <ReportMetricCard
            title='Net Profit'
            value={formatMoney(s.report.grossProfit, s.baseCurrency)}
            valueClassName={signValueClass(s.report.grossProfit)}
            compact
            muted
          />

          <ReportMetricCard
            title='Net Loss'
            value={formatMoney(-Math.abs(s.report.grossLossAbs), s.baseCurrency)}
            valueClassName='text-[var(--loss)]'
            compact
            muted
          />

          <ReportMetricCard
            title='Trades'
            value={formatNumber(s.report.totalTrades, 0)}
            compact
            muted
          />
        </div>
      </section>
    </>
  );
}