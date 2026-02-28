'use client';

import { useEffect, useState } from 'react';
import { useAccounts } from '@/src/hooks/useAccounts';
import { AccountsHeader } from './AccountsHeader';
import { AccountsTable } from './AccountsTable';
import { AccountsAddModal } from './AccountsAddModal';
import { AccountsEditModal } from './AccountsEditModal';
import { AccountsDeleteModal } from './AccountsDeleteModal';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

export function AccountsClient() {
  const s = useAccounts();
  const [theme, setTheme] = useState<DashboardTheme>('light');

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

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto w-full max-w-[1280px] space-y-8 px-4 py-8 sm:px-6 lg:px-8'>
        <AccountsHeader state={s} />

        {s.pageMsg && (
          <div className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--loss)]'>
            {s.pageMsg}
          </div>
        )}

        {s.loading && (
          <div className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-secondary)]'>
            Loading...
          </div>
        )}

        {!s.loading && <AccountsTable state={s} />}
      </div>

      <AccountsAddModal state={s} />
      <AccountsEditModal state={s} />
      <AccountsDeleteModal state={s} />
    </main>
  );
}