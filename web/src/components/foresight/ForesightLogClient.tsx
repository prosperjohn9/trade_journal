'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';

// Read history for Foresight: every read the worker (or an on-demand check)
// logged, newest first, with its close-the-loop outcome once the trade exits.
// This is where the "See it on your dashboard" Telegram link lands.

type ReadRow = {
  id: string;
  account_id: string;
  symbol: string;
  side: string;
  volume: number | null;
  warnings: number | null;
  cautions: number | null;
  tldr: string | null;
  summary: string | null;
  outcome: string | null;
  outcome_note: string | null;
  closed_pnl: number | null;
  created_at: string;
};

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

function money(n: number, currency: string): string {
  const v = Math.round(n * 100) / 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)} ${currency}`;
}

export function ForesightLogClient() {
  const router = useRouter();
  const [theme, setTheme] = useState<DashboardTheme>('dark');
  const [loading, setLoading] = useState(true);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [accounts, setAccounts] = useState<
    Map<string, { name: string; currency: string }>
  >(new Map());

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') setTheme(saved);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!auth.user) {
        router.replace('/auth');
        return;
      }
      const [{ data: readRows }, { data: acctRows }] = await Promise.all([
        supabase
          .from('foresight_reads')
          .select(
            'id, account_id, symbol, side, volume, warnings, cautions, tldr, summary, outcome, outcome_note, closed_pnl, created_at',
          )
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('accounts').select('id, name, currency'),
      ]);
      if (cancelled) return;
      setReads((readRows ?? []) as ReadRow[]);
      const map = new Map<string, { name: string; currency: string }>();
      for (const a of (acctRows ?? []) as Array<{
        id: string;
        name: string;
        currency: string | null;
      }>) {
        map.set(a.id, { name: a.name, currency: a.currency ?? 'USD' });
      }
      setAccounts(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8'>
        <header className='flex flex-col gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-[2rem] font-semibold tracking-tight'>
              Foresight reads
            </h1>
            <p className='mt-1 text-sm text-[var(--text-secondary)]'>
              Every read at the moment of entry, and how the trade turned out.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className='self-start rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'>
            Back to dashboard
          </button>
        </header>

        {loading ? (
          <p className='px-1 text-sm text-[var(--text-secondary)]'>Loading...</p>
        ) : reads.length === 0 ? (
          <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-8 text-center'>
            <p className='text-sm font-medium text-[var(--text-primary)]'>
              No Foresight reads yet.
            </p>
            <p className='mx-auto mt-1 max-w-sm text-sm text-[var(--text-secondary)]'>
              Turn on Real-time Foresight for a MetaTrader account, then open a
              trade. The read lands here and on your Telegram.
            </p>
          </div>
        ) : (
          <ul className='space-y-4'>
            {reads.map((r) => {
              const acct = accounts.get(r.account_id);
              const won = r.outcome === 'WIN';
              const lost = r.outcome === 'LOSS';
              return (
                <li
                  key={r.id}
                  className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex flex-wrap items-center gap-2 text-sm'>
                      <span className='font-semibold text-[var(--text-primary)]'>
                        {r.symbol} {r.side}
                        {r.volume != null ? ` ${r.volume} lots` : ''}
                      </span>
                      {acct ? (
                        <span className='text-[var(--text-muted)]'>
                          · {acct.name}
                        </span>
                      ) : null}
                    </div>
                    <span className='text-xs text-[var(--text-muted)]'>
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>

                  {r.tldr ? (
                    <p className='mt-2 text-sm font-medium text-[var(--text-primary)]'>
                      {r.tldr}
                    </p>
                  ) : null}
                  {r.summary ? (
                    <p className='mt-1 text-sm leading-relaxed text-[var(--text-secondary)]'>
                      {r.summary}
                    </p>
                  ) : null}

                  {r.outcome_note ? (
                    <div className='mt-3 rounded-lg border-l-2 border-[var(--accent-cta)] bg-[var(--bg-app)] px-3 py-2'>
                      <div className='text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]'>
                        How it closed
                      </div>
                      <p className='mt-0.5 text-sm leading-relaxed text-[var(--text-secondary)]'>
                        {r.outcome_note}
                      </p>
                    </div>
                  ) : null}

                  <div className='mt-3 flex flex-wrap items-center gap-2'>
                    {r.warnings ? (
                      <span className='rounded-full bg-[var(--loss)]/15 px-2 py-0.5 text-xs font-medium text-[var(--loss)]'>
                        {r.warnings} warning{r.warnings === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {r.cautions ? (
                      <span className='rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500'>
                        {r.cautions} caution{r.cautions === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    <span className='ml-auto'>
                      {r.outcome ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            won
                              ? 'bg-[var(--profit)]/15 text-[var(--profit)]'
                              : lost
                                ? 'bg-[var(--loss)]/15 text-[var(--loss)]'
                                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                          }`}>
                          {r.outcome}
                          {r.closed_pnl != null
                            ? ` · ${money(r.closed_pnl, acct?.currency ?? 'USD')}`
                            : ''}
                        </span>
                      ) : (
                        <span className='rounded-full bg-[var(--bg-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]'>
                          Open
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
