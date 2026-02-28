'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/src/components/ui/Modal';
import { useDashboard } from '@/src/hooks/useDashboard';
import { DashboardCards } from './DashboardCards';
import { DashboardTradeTable } from './DashboardTradeTable';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

function formatPerformanceHeading(month: string): string {
  const [year, monthNum] = month.split('-').map((v) => Number(v));
  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
    return 'Monthly Performance';
  }

  const d = new Date(year, monthNum - 1, 1);
  if (Number.isNaN(d.getTime())) return 'Monthly Performance';

  return `${new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(d)} Performance`;
}

function ThemeToggleIcon({ theme }: { theme: DashboardTheme }) {
  if (theme === 'dark') {
    return (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        aria-hidden='true'
        className='h-4 w-4'
        stroke='currentColor'
        strokeWidth='1.8'
        strokeLinecap='round'
        strokeLinejoin='round'>
        <circle cx='12' cy='12' r='4' />
        <path d='M12 2.75V4.5' />
        <path d='M12 19.5v1.75' />
        <path d='M4.75 12H3' />
        <path d='M21 12h-1.75' />
        <path d='m5.64 5.64 1.24 1.24' />
        <path d='m17.12 17.12 1.24 1.24' />
        <path d='m18.36 5.64-1.24 1.24' />
        <path d='m6.88 17.12-1.24 1.24' />
      </svg>
    );
  }

  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      aria-hidden='true'
      className='h-4 w-4'
      stroke='currentColor'
      strokeWidth='1.8'
      strokeLinecap='round'
      strokeLinejoin='round'>
      <path d='M21 12.75A8.75 8.75 0 1 1 11.25 3 7 7 0 0 0 21 12.75Z' />
    </svg>
  );
}

export default function DashboardClient() {
  const router = useRouter();
  const s = useDashboard();
  const [theme, setTheme] = useState<DashboardTheme>('light');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const checklistHint = useMemo(
    () =>
      'Checklist score is based on what you checked when you added the trade.',
    [],
  );

  const periodHeading = useMemo(
    () => formatPerformanceHeading(s.month),
    [s.month],
  );

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved);
        return;
      }

      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      setTheme(prefersDark ? 'dark' : 'light');
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }

  function scrollToTrades() {
    setShowProfileMenu(false);
    const tableSection = document.getElementById('trades');
    if (tableSection) {
      tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    router.push('/dashboard#trades');
  }

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      {/* Logout confirmation */}
      <Modal
        open={s.showLogout}
        title='Log out?'
        onClose={() => {
          if (!s.loggingOut) s.setShowLogout(false);
        }}>
        <p className='text-sm text-[var(--text-secondary)]'>
          Are you sure you want to log out?
        </p>

        <div className='mt-4 flex justify-end gap-2'>
          <button
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'
            onClick={() => s.setShowLogout(false)}
            disabled={s.loggingOut}>
            Cancel
          </button>
          <button
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--loss)] hover:text-[var(--loss)] disabled:opacity-60'
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
        <p className='text-sm text-[var(--text-secondary)]'>
          This will permanently delete this trade. This cannot be undone.
        </p>

        {s.deleteTradeTarget && (
          <div className='mt-3 text-sm'>
            <div className='text-[var(--text-secondary)]'>
              <span className='font-semibold'>
                {s.deleteTradeTarget.instrument}
              </span>{' '}
              • {s.deleteTradeTarget.direction} • {s.deleteTradeTarget.outcome}
            </div>
            <div className='text-[var(--text-muted)]'>
              {new Date(s.deleteTradeTarget.opened_at).toLocaleString()}
            </div>
          </div>
        )}

        <div className='mt-4 flex justify-end gap-2'>
          <button
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'
            onClick={() => s.setDeleteTradeTarget(null)}
            disabled={s.deletingTrade}>
            Cancel
          </button>
          <button
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--loss)] hover:text-[var(--loss)] disabled:opacity-60'
            onClick={s.confirmDeleteTrade}
            disabled={s.deletingTrade}>
            {s.deletingTrade ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>

      <div className='mx-auto w-full max-w-[1280px] space-y-9 px-4 py-8 sm:px-6 lg:px-8'>
        <header className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <h1 className='text-3xl font-semibold tracking-tight md:text-[2.2rem]'>
                Journaled
              </h1>
              <p className='mt-1 text-xs text-[var(--text-muted)]'>
                Signed in as{' '}
                <span className='font-medium text-[var(--text-secondary)]'>
                  {s.displayName}
                </span>
              </p>
            </div>

            <button
              className='inline-flex items-center rounded-lg border border-transparent bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110'
              onClick={() => router.push('/trades/new')}>
              Add Trade
            </button>
          </div>

          <div className='mt-4 flex flex-wrap items-center justify-between gap-3'>
            <nav className='flex flex-wrap items-center gap-2'>
              <button
                className='inline-flex items-center rounded-lg border border-[var(--accent-soft)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-medium text-[var(--accent)]'
                onClick={() => router.push('/dashboard')}>
                Dashboard
              </button>

              <button
                className='inline-flex items-center rounded-lg border border-transparent bg-transparent px-3 py-2 text-xs font-normal text-[var(--text-muted)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                onClick={scrollToTrades}>
                Trades
              </button>

              <button
                className='inline-flex items-center rounded-lg border border-transparent bg-transparent px-3 py-2 text-xs font-normal text-[var(--text-muted)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                onClick={() => router.push('/reports/monthly')}>
                Monthly Report
              </button>

              <button
                className='inline-flex items-center rounded-lg border border-transparent bg-transparent px-3 py-2 text-xs font-normal text-[var(--text-muted)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                onClick={() => router.push('/analytics')}>
                Analytics
              </button>

              <button
                className='inline-flex items-center rounded-lg border border-transparent bg-transparent px-3 py-2 text-xs font-normal text-[var(--text-muted)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                onClick={() => router.push('/settings/accounts')}>
                Accounts
              </button>
            </nav>

            <div className='flex items-center gap-2'>
              <button
                className='inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                <ThemeToggleIcon theme={theme} />
              </button>

              <div className='relative' ref={profileMenuRef}>
                <button
                  className='inline-flex items-center rounded-lg border border-transparent bg-transparent px-3 py-2 text-xs font-normal text-[var(--text-muted)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                  onClick={() => setShowProfileMenu((v) => !v)}
                  aria-haspopup='menu'
                  aria-expanded={showProfileMenu}>
                  Profile
                  <span className='ml-2 text-xs text-[var(--text-muted)]'>
                    ▼
                  </span>
                </button>

                {showProfileMenu && (
                  <div
                    className='absolute right-0 z-20 mt-2 w-48 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2'
                    role='menu'>
                    <button
                      className='w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                      onClick={() => {
                        s.setShowProfile(true);
                        setShowProfileMenu(false);
                      }}
                      role='menuitem'>
                      Edit Profile
                    </button>

                    <button
                      className='mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--loss)]'
                      onClick={() => {
                        s.requestLogout();
                        setShowProfileMenu(false);
                      }}
                      role='menuitem'>
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Profile editor */}
        {s.profile && s.showProfile && (
          <section className='max-w-3xl space-y-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
            <div className='flex items-center justify-between gap-3'>
              <h2 className='text-base font-semibold'>Profile</h2>
              {s.profileMsg && (
                <span className='text-sm text-[var(--text-secondary)]'>
                  {s.profileMsg}
                </span>
              )}
            </div>

            <div className='grid grid-cols-1 gap-3'>
              <label className='block space-y-1'>
                <div className='text-sm text-[var(--text-secondary)]'>
                  Username
                </div>
                <input
                  className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]'
                  value={s.displayNameDraft}
                  onChange={(e) => s.setDisplayNameDraft(e.target.value)}
                  placeholder='e.g., Prosper'
                />
              </label>
            </div>

            <div className='flex flex-wrap gap-2'>
              <button
                className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'
                onClick={s.saveProfile}
                disabled={s.savingProfile}>
                Save Profile
              </button>
            </div>
          </section>
        )}

        {/* Context + filters */}
        <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-5'>
          <h2 className='text-xl font-semibold text-[var(--text-primary)]'>
            {periodHeading}
          </h2>

          <div className='mt-4 flex flex-wrap items-end gap-3'>
            <label className='text-sm text-[var(--text-secondary)]'>
              <span className='mb-1 block'>Account</span>
              <select
                className='min-w-[220px] rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]'
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
            </label>

            <label className='text-sm text-[var(--text-secondary)]'>
              <span className='mb-1 block'>Period</span>
              <input
                className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]'
                type='month'
                value={s.month}
                onChange={(e) => s.setMonth(e.target.value)}
              />
            </label>
          </div>

          {s.accountId !== 'all' && !s.hasStartingBalance && (
            <p className='mt-3 text-sm text-[var(--text-secondary)]'>
              <span className='font-semibold text-[var(--text-primary)]'>
                Tip:
              </span>{' '}
              Set a{' '}
              <span className='font-semibold text-[var(--text-primary)]'>
                Starting Balance
              </span>{' '}
              for this account to make your equity curve and drawdown
              meaningful.
            </p>
          )}
        </section>

        {s.msg && (
          <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-sm text-[var(--loss)]'>
            {s.msg}
          </section>
        )}

        {s.loading && (
          <section className='text-sm text-[var(--text-secondary)]'>
            Loading dashboard...
          </section>
        )}

        {/* KPI cards + insights */}
        <div className='pt-2'>
          <DashboardCards state={s} />
        </div>

        {/* Trades table */}
        <section
          id='trades'
          className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
          <h2 className='mb-4 text-center text-lg font-semibold'>Trades</h2>
          <DashboardTradeTable state={s} />
          <div className='mt-3 text-xs text-[var(--text-muted)]'>
            {checklistHint}
          </div>
        </section>
      </div>
    </main>
  );
}
