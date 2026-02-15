'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/src/components/ui/Modal';
import { formatMoney } from '@/src/lib/format';
import { useDashboard } from '@/src/hooks/useDashboard';
import type { Outcome } from '@/src/lib/dashboard';

function formatNumber(amount: number, maxDigits = 2): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: maxDigits,
  }).format(amount);
}

function formatPercent(amount: number, maxDigits = 2): string {
  return `${formatNumber(amount, maxDigits)}%`;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function signColor(n: number): string {
  if (n > 0) return 'text-emerald-600';
  if (n < 0) return 'text-rose-600';
  return 'text-slate-700';
}

function badgeClasses(outcome: Outcome): string {
  switch (outcome) {
    case 'WIN':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'LOSS':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function reviewedBadge(reviewedAt: string | null) {
  return reviewedAt ? (
    <span className='text-xs border rounded-full px-2 py-1 bg-slate-50'>
      Reviewed
    </span>
  ) : (
    <span className='text-xs border rounded-full px-2 py-1 bg-white'>
      Not reviewed
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const s = useDashboard();

  const equityUp =
    s.equity !== null &&
    s.monthStartingBalance !== null &&
    s.equity >= s.monthStartingBalance;

  const equityDown =
    s.equity !== null &&
    s.monthStartingBalance !== null &&
    s.equity < s.monthStartingBalance;

  const canShowEquityCards = s.monthStartingBalance !== null;

  const checklistHint = useMemo(
    () =>
      'Checklist score is based on what you checked when you added the trade.',
    [],
  );

  return (
    <main className='p-6 space-y-6'>
      {/* Logout confirmation */}
      <Modal
        open={s.showLogout}
        title='Log out?'
        onClose={() => {
          if (!s.loggingOut) s.setShowLogout(false);
        }}>
        <p className='text-sm opacity-80'>Are you sure you want to log out?</p>

        <div className='mt-4 flex gap-2 justify-end'>
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={() => s.setShowLogout(false)}
            disabled={s.loggingOut}>
            Cancel
          </button>
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={s.confirmLogout}
            disabled={s.loggingOut}>
            {s.loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </Modal>

      {/* Delete trade confirmation */}
      <Modal
        open={!!s.deleteTradeTarget}
        title='Delete trade?'
        onClose={() => {
          if (!s.deletingTrade) s.setDeleteTradeTarget(null);
        }}>
        <p className='text-sm opacity-80'>
          This will permanently delete this trade. This cannot be undone.
        </p>

        {s.deleteTradeTarget && (
          <div className='mt-3 text-sm'>
            <div className='opacity-80'>
              <span className='font-semibold'>
                {s.deleteTradeTarget.instrument}
              </span>{' '}
              • {s.deleteTradeTarget.direction} • {s.deleteTradeTarget.outcome}
            </div>
            <div className='opacity-70'>
              {new Date(s.deleteTradeTarget.opened_at).toLocaleString()}
            </div>
          </div>
        )}

        <div className='mt-4 flex gap-2 justify-end'>
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={() => s.setDeleteTradeTarget(null)}
            disabled={s.deletingTrade}>
            Cancel
          </button>
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={s.confirmDeleteTrade}
            disabled={s.deletingTrade}>
            {s.deletingTrade ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>

      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Dashboard</h1>
          <div className='text-sm opacity-80'>
            Signed in as <span className='font-semibold'>{s.displayName}</span>
          </div>

          {s.accountId !== 'all' && !s.hasStartingBalance && (
            <div className='text-sm opacity-80'>
              <span className='font-semibold'>Tip:</span> Set a{' '}
              <span className='font-semibold'>Starting Balance</span> for this
              account to make your equity curve and drawdown meaningful.
            </div>
          )}
        </div>

        <div className='flex gap-2'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/reports/monthly')}>
            Monthly Report
          </button>

          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/analytics')}>
            Analytics
          </button>

          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/settings/accounts')}>
            Accounts
          </button>

          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => s.setShowProfile((v) => !v)}>
            {s.showProfile ? 'Close' : 'Edit Profile'}
          </button>

          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/trades/new')}>
            Add Trade
          </button>

          <button
            className='border rounded-lg px-4 py-2'
            onClick={s.requestLogout}>
            Logout
          </button>
        </div>
      </header>

      {s.profile && s.showProfile && (
        <section className='border rounded-xl p-4 max-w-3xl space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='font-semibold'>Profile</h2>
            {s.profileMsg && (
              <span className='text-sm opacity-80'>{s.profileMsg}</span>
            )}
          </div>

          <div className='grid grid-cols-1 gap-3'>
            <label className='space-y-1 block'>
              <div className='text-sm opacity-70'>Username</div>
              <input
                className='w-full border rounded-lg p-3'
                value={s.displayNameDraft}
                onChange={(e) => s.setDisplayNameDraft(e.target.value)}
                placeholder='e.g., Prosper'
              />
            </label>
          </div>

          <div className='flex flex-wrap gap-2'>
            <button
              className='border rounded-lg px-4 py-2 disabled:opacity-60'
              onClick={s.saveProfile}
              disabled={s.savingProfile}>
              Save Profile
            </button>
          </div>
        </section>
      )}

      <section className='flex flex-col md:flex-row md:items-center gap-3'>
        <div className='flex items-center gap-3'>
          <label className='text-sm opacity-80'>Account:</label>
          <select
            className='border rounded-lg p-2'
            value={s.accountId}
            onChange={(e) => s.setAccountId(e.target.value)}
            disabled={!s.accounts.length}
            aria-label='Account selector'>
            <option value='all'>All accounts</option>
            {s.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className='flex items-center gap-3'>
          <label className='text-sm opacity-80'>Month:</label>
          <input
            className='border rounded-lg p-2'
            type='month'
            value={s.month}
            onChange={(e) => s.setMonth(e.target.value)}
          />
        </div>
      </section>

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
              value={
                s.equity === null ? '—' : formatMoney(s.equity, s.currency)
              }
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

      <section className='border rounded-xl p-4'>
        <h2 className='font-semibold mb-3'>Trades</h2>

        <div className='overflow-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-left border-b'>
                <th className='p-2'>Date</th>
                <th className='p-2'>Instrument</th>
                <th className='p-2'>Dir</th>
                <th className='p-2'>Outcome</th>
                <th className='p-2'>P&L ($)</th>
                <th className='p-2'>P&L (%)</th>
                <th className='p-2'>R</th>
                <th className='p-2'>Checklist</th>
                <th className='p-2'>Reviewed</th>
                <th className='p-2'>Actions</th>
              </tr>
            </thead>

            <tbody>
              {s.trades.map((t) => {
                const pnlAmt = s.calcDisplayPnl(t);

                const pnlPct = s.monthStartingBalance
                  ? (pnlAmt / s.monthStartingBalance) * 100
                  : 0;

                const score = s.checklistScoreByTrade[t.id] ?? null;

                return (
                  <tr key={t.id} className='border-b'>
                    <td className='p-2'>
                      {new Date(t.opened_at).toLocaleString()}
                    </td>
                    <td className='p-2'>{t.instrument}</td>
                    <td className='p-2'>{t.direction}</td>

                    <td className='p-2'>
                      <span
                        className={cx(
                          'inline-flex items-center px-2 py-1 rounded-full border text-xs font-semibold',
                          badgeClasses(t.outcome),
                        )}>
                        {t.outcome}
                      </span>
                    </td>

                    <td className={cx('p-2 font-medium', signColor(pnlAmt))}>
                      {formatMoney(pnlAmt, s.currency)}
                    </td>

                    <td className={cx('p-2 font-medium', signColor(pnlPct))}>
                      {formatPercent(pnlPct, 2)}
                    </td>

                    <td className='p-2'>
                      {t.r_multiple === null || t.r_multiple === undefined
                        ? '—'
                        : formatNumber(Number(t.r_multiple), 2)}
                    </td>

                    <td className='p-2'>
                      {score === null ? '—' : `${score.toFixed(0)}%`}
                    </td>

                    <td className='p-2'>{reviewedBadge(t.reviewed_at)}</td>

                    <td className='p-2'>
                      <div className='flex flex-wrap gap-2'>
                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => router.push(`/trades/${t.id}`)}>
                          View
                        </button>

                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => router.push(`/trades/${t.id}/edit`)}>
                          Edit
                        </button>

                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => router.push(`/trades/${t.id}/review`)}>
                          Review
                        </button>

                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => s.requestDeleteTrade(t)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!s.trades.length && (
                <tr>
                  <td className='p-2 opacity-70' colSpan={10}>
                    No trades for this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className='text-xs opacity-70 mt-3'>{checklistHint}</div>
      </section>
    </main>
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