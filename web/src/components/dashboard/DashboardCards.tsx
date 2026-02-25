'use client';

import { formatMoney } from '@/src/lib/utils/format';
import { cx } from '@/src/lib/utils/ui';
import {
  signColor,
  formatNumber,
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
  | 'trades'
  | 'checklistScoreByTrade'
  | 'calcDisplayPnl'
>;

function formatSignedPercent(amount: number, maxDigits = 1): string {
  const sign = amount > 0 ? '+' : '';
  return `${sign}${formatPercent(amount, maxDigits)}`;
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function DashboardCards({ state: s }: { state: PropsState }) {
  const rValues = s.trades
    .map((t) => Number(t.r_multiple))
    .filter((v) => Number.isFinite(v));
  const avgR = rValues.length
    ? rValues.reduce((acc, v) => acc + v, 0) / rValues.length
    : null;

  const avgPnl = s.stats.total ? s.stats.pnlDollar / s.stats.total : 0;

  const checklistValues = s.trades
    .map((t) => s.checklistScoreByTrade[t.id])
    .filter(
      (score): score is number =>
        typeof score === 'number' && Number.isFinite(score),
    );
  const avgChecklist = checklistValues.length
    ? checklistValues.reduce((acc, v) => acc + v, 0) / checklistValues.length
    : null;

  const pnlByDay: Record<string, number> = {};
  for (const trade of s.trades) {
    const openedAt = new Date(trade.opened_at);
    const key = `${openedAt.getFullYear()}-${String(openedAt.getMonth() + 1).padStart(2, '0')}-${String(openedAt.getDate()).padStart(2, '0')}`;

    pnlByDay[key] = (pnlByDay[key] ?? 0) + s.calcDisplayPnl(trade);
  }
  const dailyPnls = Object.values(pnlByDay);
  const winningDays = dailyPnls.filter((pnl) => pnl > 0).length;
  const activeDays = dailyPnls.length;

  const winningDayRate = activeDays ? (winningDays / activeDays) * 100 : 0;

  const consistencyScore = clampPercent(
    Math.round(
      (avgChecklist ?? s.stats.winRate) * 0.6 +
        winningDayRate * 0.2 +
        s.stats.winRate * 0.2,
    ),
  );

  const equityDelta =
    s.equity !== null && s.monthStartingBalance !== null
      ? s.equity - s.monthStartingBalance
      : null;

  return (
    <section className='space-y-5'>
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
        <PrimaryCard
          title='Net P&L'
          value={formatMoney(s.stats.pnlDollar, s.currency)}
          support={formatSignedPercent(s.monthPnlPct, 1)}
          valueClassName={signColor(s.stats.pnlDollar)}
          emphasized
          glowTone={
            s.stats.pnlDollar > 0 ? 'profit' : s.stats.pnlDollar < 0 ? 'loss' : 'neutral'
          }
        />

        <PrimaryCard
          title='Equity'
          value={s.equity === null ? '—' : formatMoney(s.equity, s.currency)}
          valueClassName={equityDelta === null ? undefined : signColor(equityDelta)}
        />

        <PrimaryCard
          title='Win Rate'
          value={formatPercent(s.stats.winRate, 0)}
          valueClassName='text-[var(--text-primary)]'
        />
      </div>

      <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
        <SecondaryCard title='Trades' value={formatNumber(s.stats.total, 0)} />
        <SecondaryCard title='Wins' value={formatNumber(s.stats.wins, 0)} />
        <SecondaryCard title='Losses' value={formatNumber(s.stats.losses, 0)} />
        <SecondaryCard title='Breakeven' value={formatNumber(s.stats.be, 0)} />

        <SecondaryCard
          title='Starting Bal.'
          value={
            s.loadingPriorPnl
              ? '…'
              : s.monthStartingBalance === null
                ? '—'
                : formatMoney(s.monthStartingBalance, s.currency)
          }
        />
        <SecondaryCard
          title='Commissions'
          value={formatMoney(-Math.abs(s.stats.commissionsPaid), s.currency)}
          valueClassName='text-[var(--loss)]'
        />
        <SecondaryCard
          title='Avg R'
          value={avgR === null ? '—' : formatNumber(avgR, 2)}
          valueClassName={avgR === null ? undefined : signColor(avgR)}
        />
        <SecondaryCard
          title='Avg P&L'
          value={formatMoney(avgPnl, s.currency)}
          valueClassName={signColor(avgPnl)}
        />
      </div>

      <div
        className='rounded-xl border border-[var(--border-default)] border-l-4 border-l-[var(--accent)] px-5 py-3.5 text-sm font-medium text-[var(--text-secondary)]'
        style={{ backgroundColor: 'var(--accent-strip-bg)' }}>
        <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
          <span>
            Consistency Score:{' '}
            <strong className='font-semibold text-[var(--text-primary)]'>
              {formatPercent(consistencyScore, 0)}
            </strong>
          </span>
          <span>
            Avg Checklist:{' '}
            <strong className='font-semibold text-[var(--text-primary)]'>
              {avgChecklist === null ? '—' : formatPercent(avgChecklist, 0)}
            </strong>
          </span>
          <span>
            <strong className='font-semibold text-[var(--text-primary)]'>
              {winningDays}
            </strong>{' '}
            Winning Days
          </span>
        </div>
      </div>
    </section>
  );
}

function PrimaryCard({
  title,
  value,
  support,
  valueClassName,
  emphasized = false,
  glowTone = 'neutral',
}: {
  title: string;
  value: React.ReactNode;
  support?: React.ReactNode;
  valueClassName?: string;
  emphasized?: boolean;
  glowTone?: 'profit' | 'loss' | 'neutral';
}) {
  const glowByTone = {
    profit:
      'linear-gradient(to bottom right, rgba(34,197,94,0.08), transparent 68%)',
    loss: 'linear-gradient(to bottom right, rgba(248,113,113,0.08), transparent 68%)',
    neutral:
      'linear-gradient(to bottom right, rgba(148,163,184,0.08), transparent 68%)',
  } as const;

  return (
    <div
      className='flex min-h-[160px] flex-col justify-between rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'
      style={emphasized ? { backgroundImage: glowByTone[glowTone] } : undefined}>
      <div className='text-sm font-medium text-[var(--text-secondary)]'>{title}</div>
      <div>
        <div
          className={cx(
            'leading-none tracking-[-0.02em] tabular-nums',
            emphasized ? 'text-[2.7rem] font-bold' : 'text-[2.35rem] font-semibold',
            valueClassName ?? 'text-[var(--text-primary)]',
          )}>
          {value}
        </div>
        {support ? (
          <div className='mt-2 text-sm text-[var(--text-muted)]'>{support}</div>
        ) : null}
      </div>
    </div>
  );
}

function SecondaryCard({
  title,
  value,
  valueClassName,
}: {
  title: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] p-5'>
      <div className='text-sm text-[var(--text-secondary)]'>{title}</div>
      <div
        className={cx(
          'mt-2 text-[1.95rem] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-[var(--text-primary)]',
          valueClassName,
        )}>
        {value}
      </div>
    </div>
  );
}
