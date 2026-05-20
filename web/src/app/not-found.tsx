'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

export default function NotFound() {
  const router = useRouter();
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
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-12 text-center'>
        <div className='mb-6 text-7xl'>🧭</div>
        <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
          We couldn&apos;t find that page
        </h1>
        <p className='mt-3 text-sm text-[var(--text-secondary)] sm:text-base'>
          The link might be broken, or the page may have been moved. Either way,
          it&apos;s not here.
        </p>

        <div className='mt-8 flex flex-wrap items-center justify-center gap-2'>
          <button
            type='button'
            onClick={() => router.push('/dashboard')}
            className='rounded-lg border border-transparent bg-[var(--accent-cta)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110'>
            Back to dashboard
          </button>
          <button
            type='button'
            onClick={() => router.back()}
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'>
            Go back
          </button>
        </div>
      </div>
    </main>
  );
}
