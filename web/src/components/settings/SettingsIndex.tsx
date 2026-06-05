'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

// Each card on the settings index. Add new sections here and they'll
// auto-appear in the grid below.
const SECTIONS: Array<{
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    href: '/settings/profile',
    title: 'Profile',
    description: 'Your profile and display name, plus the danger zone to delete your account.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.6'
        strokeLinecap='round'
        strokeLinejoin='round'
        className='h-5 w-5'>
        <circle cx='12' cy='8' r='4' />
        <path d='M4 21v-1a8 8 0 0 1 16 0v1' />
      </svg>
    ),
  },
  {
    href: '/settings/accounts',
    title: 'Trading Accounts',
    description:
      'Manage your trading capital. Track multiple accounts (Live, Demo, prop, investor) side by side.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.6'
        strokeLinecap='round'
        strokeLinejoin='round'
        className='h-5 w-5'>
        <rect x='3' y='6' width='18' height='13' rx='2' />
        <path d='M3 10h18' />
        <path d='M7 15h4' />
      </svg>
    ),
  },
  {
    href: '/settings/setups',
    title: 'Setup Templates',
    description:
      'Build entry criteria checklists you can apply when logging a trade.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.6'
        strokeLinecap='round'
        strokeLinejoin='round'
        className='h-5 w-5'>
        <rect x='4' y='4' width='16' height='16' rx='2' />
        <path d='M8 9l2 2 4-4' />
        <path d='M8 16h8' />
      </svg>
    ),
  },
  {
    href: '/settings/billing',
    title: 'Billing & Plan',
    description:
      'Your subscription, what it unlocks, and how to change your plan.',
    icon: (
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.6'
        strokeLinecap='round'
        strokeLinejoin='round'
        className='h-5 w-5'>
        <rect x='2' y='5' width='20' height='14' rx='2' />
        <path d='M2 10h20' />
        <path d='M6 15h4' />
      </svg>
    ),
  },
];

export function SettingsIndex() {
  const router = useRouter();
  const [theme, setTheme] = useState<DashboardTheme>('light');
  const [authChecked, setAuthChecked] = useState(false);

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
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // Mirror what the subpages do: if not signed in, bounce to /auth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.replace('/auth');
        return;
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authChecked) {
    return (
      <main
        className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
        data-theme={theme}>
        <div className='mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8'>
          <p className='text-sm text-[var(--text-secondary)]'>Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto w-full max-w-[1280px] space-y-8 px-4 py-8 sm:px-6 lg:px-8'>
        <header className='flex flex-col gap-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-[2rem] font-semibold tracking-tight text-[var(--text-primary)]'>
              Settings
            </h1>
            <p className='mt-1 text-sm text-[var(--text-secondary)]'>
              Manage your profile, trading accounts, and setup templates.
            </p>
          </div>

          <div className='flex flex-wrap gap-2 md:justify-end'>
            <button
              className='rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
              onClick={() => router.push('/dashboard')}>
              Back to dashboard
            </button>
          </div>
        </header>

        <section className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {SECTIONS.map((section) => (
            <button
              key={section.href}
              type='button'
              onClick={() => router.push(section.href)}
              className='group flex flex-col gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-left transition-colors hover:border-[var(--accent-cta)]/60 hover:bg-[var(--bg-subtle)]'>
              <div className='inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] text-[var(--text-secondary)] transition-colors group-hover:border-[var(--accent-cta)]/40 group-hover:text-[var(--accent-cta)]'>
                {section.icon}
              </div>
              <div>
                <h2 className='text-base font-semibold text-[var(--text-primary)]'>
                  {section.title}
                </h2>
                <p className='mt-1 text-sm leading-relaxed text-[var(--text-secondary)]'>
                  {section.description}
                </p>
              </div>
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}
