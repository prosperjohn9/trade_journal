'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';
import { formatMoney } from '@/src/lib/utils/format';
import { Card, LineChart } from './monthly-report-ui';

type State = Pick<
  MonthlyReportState,
  'report' | 'baseCurrency' | 'monthStartingBalance'
>;

export function MonthlyReportEquitySection({ state: s }: { state: State }) {
  return (
    <section className='border rounded-xl p-4 space-y-3'>
      <div className='flex items-center justify-between gap-4'>
        <h2 className='font-semibold'>Equity Curve</h2>

        <div className='text-sm opacity-70'>
          Start: {formatMoney(s.report.startingBalance, s.baseCurrency)} • End:{' '}
          {formatMoney(s.report.endingBalance, s.baseCurrency)}
        </div>
      </div>

      <LineChart
        values={[
          s.report.startingBalance,
          ...s.report.daily.map((p) => p.equity),
        ]}
        labels={['Start', ...s.report.daily.map((p) => p.dateLabel)]}
      />

      <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
        <Card
          title='Total P&L'
          value={formatMoney(s.report.netPnl, s.baseCurrency)}
        />
        <Card title='Trades' value={s.report.totalTrades} />
        <Card title='Win Rate' value={`${s.report.winRate.toFixed(1)}%`} />
        <Card
          title='Max DD'
          value={formatMoney(s.report.maxDrawdown, s.baseCurrency)}
        />
      </div>
    </section>
  );
}