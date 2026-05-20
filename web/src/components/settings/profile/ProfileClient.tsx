'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import { DeleteAccountModal } from './DeleteAccountModal';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

export function ProfileClient() {
  const router = useRouter();
  const [theme, setTheme] = useState<DashboardTheme>('light');
  const [email, setEmail] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace('/auth');
        return;
      }
      setEmail(data.user.email ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8'>
        <header className='flex flex-col gap-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-[2rem] font-semibold tracking-tight text-[var(--text-primary)]'>
              Profile
            </h1>
            <p className='mt-1 text-sm text-[var(--text-secondary)]'>
              Your account details and danger zone.
            </p>
          </div>

          <div className='flex flex-wrap gap-2 md:justify-end'>
            <button
              className='rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
              onClick={() => router.push('/dashboard')}>
              Back
            </button>
          </div>
        </header>

        {/* Account overview */}
        <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
          <h2 className='text-lg font-semibold text-[var(--text-primary)]'>
            Account
          </h2>
          <dl className='mt-4 space-y-3 text-sm'>
            <div className='flex justify-between gap-4'>
              <dt className='text-[var(--text-secondary)]'>Email</dt>
              <dd className='text-[var(--text-primary)]'>
                {email ?? '—'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Danger zone — destructive actions. Red-bordered to set tone. */}
        <section className='rounded-xl border border-red-500/40 bg-red-500/[0.04] p-5'>
          <h2 className='text-lg font-semibold text-red-400'>Danger zone</h2>
          <p className='mt-1 text-sm text-[var(--text-secondary)]'>
            Permanently delete your account and all data we hold about you.
            This action cannot be undone.
          </p>

          <div className='mt-5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-4'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
              <div className='space-y-1'>
                <h3 className='text-sm font-semibold text-[var(--text-primary)]'>
                  Delete account
                </h3>
                <p className='text-xs leading-relaxed text-[var(--text-secondary)]'>
                  Removes your account, all trades, all trading accounts, all
                  setup templates, all screenshots, and all other personal
                  data within 30 days. We may retain limited information where
                  required by law (see our{' '}
                  <a
                    href='/privacy'
                    className='underline-offset-4 hover:underline'>
                    Privacy Policy
                  </a>
                  ).
                </p>
              </div>
              <button
                type='button'
                onClick={() => setDeleteOpen(true)}
                className='shrink-0 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20'>
                Delete account
              </button>
            </div>
          </div>
        </section>
      </div>

      <DeleteAccountModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </main>
  );
}
