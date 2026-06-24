'use client';

import { useEffect, useState } from 'react';

// Theme switch for the public marketing pages. Cycles System -> Light -> Dark.
// 'system' (default, first visit) follows the OS live via the CSS
// prefers-color-scheme rules; light/dark pin the choice. Persisted under the
// same 'dashboard-theme' key the dashboard reads, so the preference carries
// across the whole product. The pre-paint script in the root layout applies
// the saved value before hydration, so there is no flash.

type Mode = 'system' | 'light' | 'dark';
const KEY = 'dashboard-theme';
const ORDER: Mode[] = ['system', 'light', 'dark'];

function applyMode(mode: Mode) {
  const d = document.documentElement;
  if (mode === 'light' || mode === 'dark') {
    d.setAttribute('data-theme', mode);
    d.style.colorScheme = mode;
  } else {
    d.removeAttribute('data-theme');
    d.style.colorScheme = 'light dark';
  }
}

const LABEL: Record<Mode, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setMounted(true);
      try {
        const saved = localStorage.getItem(KEY);
        setMode(saved === 'light' || saved === 'dark' ? saved : 'system');
      } catch {
        // localStorage unavailable (private mode); stay on system.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // ignore persistence failures
    }
    applyMode(next);
  }

  // Until mounted, render the system icon so server and client agree.
  const shown: Mode = mounted ? mode : 'system';

  return (
    <button
      type='button'
      onClick={cycle}
      aria-label={`${LABEL[shown]} (click to change)`}
      title={LABEL[shown]}
      className='inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'>
      {shown === 'system' ? <MonitorIcon /> : null}
      {shown === 'light' ? <SunIcon /> : null}
      {shown === 'dark' ? <MoonIcon /> : null}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden>
      <circle cx='12' cy='12' r='4' />
      <path d='M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden>
      <path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden>
      <rect x='2' y='3' width='20' height='14' rx='2' />
      <path d='M8 21h8M12 17v4' />
    </svg>
  );
}
