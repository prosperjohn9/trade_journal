'use client';

import { formatMoney } from '@/src/lib/utils/format';
import { cx } from '@/src/lib/utils/ui';
import {
  signColor,
  formatPercent,
} from '@/src/components/dashboard/dashboard-ui';
import type { DashboardState } from '@/src/hooks/useDashboard';

type PropsState = Pick<
  DashboardState,
  | 'monthStartingBalance'
  | 'equity'
  | 'loadingPriorPnl'
  | 'currency'
  | 'monthPnlPct'
  | 'stats'
>;

export function DashboardCards({ state: s }: { state: PropsState }) {
  const canShowEquityCards = s.monthStartingBalance !== null;

  const equityUp =
    s.equity !== null &&
    s.monthStartingBalance !== null &&
    s.equity >= s.monthStartingBalance;

  const equityDown =
    s.equity !== null &&
    s.monthStartingBalance !== null &&
    s.equity < s.monthStartingBalance;

  return (
    <section className='grid grid-cols-2 md:grid-cols-4 gap-3'>
      {canShowEquityCards && (
        <>
          <Card
            title='Starting Balance'
            value={
              s.loadingPriorPnl
                ? '…'
                : formatMoney(s.monthStartingBalance ?? 0, s.currency)
            }
            valueClassName='text-slate-900'
          />
          <Card
            title='Equity'
            value={s.equity === null ? '—' : formatMoney(s.equity, s.currency)}
            valueClassName={cx(
              equityUp && 'text-emerald-700',
              equityDown && 'text-rose-700',
            )}
          />
        </>
      )}

      <Card title='Trades' value={s.stats.total} />
      <Card title='Win Rate' value={formatPercent(s.stats.winRate, 0)} />
      <Card
        title='P&L ($)'
        value={formatMoney(s.stats.pnlDollar, s.currency)}
        valueClassName={signColor(s.stats.pnlDollar)}
      />
      <Card
        title='P&L (%)'
        value={formatPercent(s.monthPnlPct, 2)}
        valueClassName={signColor(s.monthPnlPct)}
      />
      <Card
        title='Commissions'
        value={formatMoney(-Math.abs(s.stats.commissionsPaid), s.currency)}
        valueClassName='text-rose-600'
      />
      <Card title='Wins' value={s.stats.wins} />
      <Card title='Losses' value={s.stats.losses} />
      <Card title='Breakeven' value={s.stats.be} />
    </section>
  );
}

function Card({
  title,
  value,
  valueClassName,
}: {
  title: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className='border rounded-xl p-4'>
      <div className='text-sm opacity-70'>{title}</div>
      <div className={cx('text-xl font-semibold', valueClassName)}>{value}</div>
    </div>
  );
}