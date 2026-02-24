'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/src/components/ui/Modal';
import { useDashboard } from '@/src/hooks/useDashboard';
import { DashboardCards } from './DashboardCards';
import { DashboardTradeTable } from './DashboardTradeTable';

export default function DashboardClient() {
  const router = useRouter();
  const s = useDashboard();

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

      {/* Profile editor */}
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

      {/* Filters */}
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

      {/* Cards */}
      <DashboardCards state={s} />

      {/* Trades table */}
      <section className='border rounded-xl p-4'>
        <h2 className='font-semibold mb-3'>Trades</h2>
        <DashboardTradeTable state={s} />
        <div className='text-xs opacity-70 mt-3'>{checklistHint}</div>
      </section>
    </main>
  );
}