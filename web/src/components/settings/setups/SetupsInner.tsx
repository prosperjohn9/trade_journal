'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSetups } from '@/src/hooks/useSetups';
import { SetupsHeader } from './SetupsHeader';
import { SetupsCreateTemplate } from './SetupsCreateTemplate';
import { SetupsTemplatesPanel } from './SetupsTemplatesPanel';
import { SetupsItemsPanel } from './SetupsItemsPanel';
import { SetupsDeleteModal } from './SetupsDeleteModal';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

export function SetupsInner() {
  const s = useSetups();
  const sp = useSearchParams();
  const [theme, setTheme] = useState<DashboardTheme>('light');

  // Only allow internal paths to avoid open-redirect issues.
  const returnToParam = sp.get('returnTo');
  const returnTo =
    returnToParam && returnToParam.startsWith('/') ? returnToParam : null;

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

  function handleBack() {
    if (returnTo) {
      s.router.push(returnTo);
      return;
    }
    s.router.back();
  }

  if (s.loading) {
    return (
      <main
        className='dashboard-theme min-h-screen bg-[var(--bg-app)] p-6 text-[var(--text-primary)]'
        data-theme={theme}>
        Loading...
      </main>
    );
  }

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto w-full max-w-[1280px] space-y-6 px-4 py-8 sm:px-6 lg:px-8'>
        <SetupsDeleteModal state={s} />

        <SetupsHeader state={s} onBack={handleBack} />

        <div className='grid grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,34%)_minmax(0,66%)]'>
          <aside className='space-y-4'>
            <SetupsCreateTemplate state={s} />
            <SetupsTemplatesPanel state={s} />
          </aside>

          <section>
            {s.selectedTemplateId ? (
              <SetupsItemsPanel state={s} />
            ) : (
              <div className='rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--text-muted)]'>
                Select a template to start editing checklist rules.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
