'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

// Next.js App Router error boundary. Renders when any descendant throws an
// uncaught error during render. `reset` re-renders the segment so the user
// can retry without a full page reload.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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

  useEffect(() => {
    // Log to the browser console so the user / a future error-monitoring
    // service can inspect what blew up.
    console.error('Caught by global error boundary:', error);
  }, [error]);

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-12 text-center'>
        <div className='mb-6 text-7xl'>⚠️</div>
        <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
          Something went wrong
        </h1>
        <p className='mt-3 text-sm text-[var(--text-secondary)] sm:text-base'>
          We hit an unexpected error rendering this page. Your data is safe —
          this is just a UI glitch. Try again, or head back to the dashboard.
        </p>

        {/* Show the error message in non-production so devs see what broke.
            In production we don't display message strings (could contain
            sensitive info), but the console log above stays.  */}
        {process.env.NODE_ENV !== 'production' && error?.message && (
          <pre className='mt-6 max-w-full overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-left text-xs text-[var(--text-secondary)]'>
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        )}

        <div className='mt-8 flex flex-wrap items-center justify-center gap-2'>
          <button
            type='button'
            onClick={() => reset()}
            className='rounded-lg border border-transparent bg-[var(--accent-cta)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110'>
            Try again
          </button>
          <button
            type='button'
            onClick={() => router.push('/dashboard')}
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'>
            Back to dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
