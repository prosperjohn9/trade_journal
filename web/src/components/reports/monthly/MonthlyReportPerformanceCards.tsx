'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';
import { Card } from './monthly-report-ui';

type State = Pick<MonthlyReportState, 'report' | 'baseCurrency'>;

export function MonthlyReportPerformanceCards({ state: s }: { state: State }) {
  return (
    <>
      <section className='grid grid-cols-2 md:grid-cols-4 gap-3'>
        <Card
          title='Average Profit'
          value={formatMoney(s.report.avgWin, s.baseCurrency)}
        />
        <Card
          title='Average Loss'
          value={formatMoney(s.report.avgLoss, s.baseCurrency)}
        />
        <Card title='RRR' value={s.report.rrr.toFixed(2)} />
        <Card
          title='Expectancy / Trade'
          value={formatMoney(s.report.expectancy, s.baseCurrency)}
        />
        <Card
          title='Profit Factor'
          value={
            Number.isFinite(s.report.profitFactor)
              ? s.report.profitFactor.toFixed(2)
              : '∞'
          }
        />
        <Card title='Sharpe Ratio' value={s.report.sharpe.toFixed(2)} />
        <Card
          title='Net Profit'
          value={formatMoney(s.report.grossProfit, s.baseCurrency)}
        />
        <Card
          title='Net Loss'
          value={formatMoney(s.report.grossLossAbs, s.baseCurrency)}
        />
      </section>
    </>
  );
}