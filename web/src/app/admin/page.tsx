'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/src/lib/api/fetcher';

// Founder-only overview. The API is gated by ADMIN_EMAILS; anyone else gets a
// 404 from the endpoint and the access-denied state here.

type Overview = {
  totals: {
    users: number;
    entitledSubscriptions: number;
    lifetimeComps: number;
    mrr: number;
    trades: number;
    brokerConnections: number;
    aiActionsThisMonth: number;
    brokerRefreshesThisMonth: number;
  };
  planCounts: Record<string, number>;
  recentSignups: Array<{
    email: string;
    createdAt: string | null;
    lastSignInAt: string | null;
    plan: string | null;
    status: string | null;
  }>;
};

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

function fmtDate(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
      <div className='text-xs text-[var(--text-muted)]'>{label}</div>
      <div className='mt-1 text-2xl font-semibold text-[var(--text-primary)]'>
        {value}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<DashboardTheme>('light');
  const [data, setData] = useState<Overview | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved);
        return;
      }
      setTheme(
        window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light',
      );
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await apiFetch<Overview>('/api/admin/overview');
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) setDenied(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto w-full max-w-[1100px] space-y-6 px-4 py-8 sm:px-6'>
        <header className='flex items-center justify-between'>
          <div>
            <h1 className='text-[2rem] font-semibold tracking-tight'>Admin</h1>
            <p className='mt-1 text-sm text-[var(--text-secondary)]'>
              Users, revenue, and usage at a glance.
            </p>
          </div>
          <button
            className='rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            onClick={() => router.push('/dashboard')}>
            Back to app
          </button>
        </header>

        {loading ? (
          <p className='text-sm text-[var(--text-secondary)]'>Loading…</p>
        ) : denied || !data ? (
          <p className='text-sm text-[var(--text-secondary)]'>
            This page is not available.
          </p>
        ) : (
          <>
            <section className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
              <Kpi label='Users' value={data.totals.users} />
              <Kpi
                label='Active subscriptions'
                value={data.totals.entitledSubscriptions}
              />
              <Kpi label='MRR (est.)' value={`$${data.totals.mrr}`} />
              <Kpi label='Trades logged' value={data.totals.trades} />
              <Kpi
                label='Broker connections'
                value={data.totals.brokerConnections}
              />
              <Kpi
                label='AI actions this month'
                value={data.totals.aiActionsThisMonth}
              />
              <Kpi
                label='Broker syncs this month'
                value={data.totals.brokerRefreshesThisMonth}
              />
              <Kpi label='Lifetime comps' value={data.totals.lifetimeComps} />
            </section>

            <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
              <h2 className='text-lg font-semibold'>Plans</h2>
              <div className='mt-3 grid grid-cols-3 gap-3'>
                {(['pro', 'elite', 'master'] as const).map((p) => (
                  <div
                    key={p}
                    className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
                    <div className='text-xs capitalize text-[var(--text-muted)]'>
                      {p}
                    </div>
                    <div className='text-xl font-semibold'>
                      {data.planCounts[p] ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
              <h2 className='text-lg font-semibold'>Recent signups</h2>
              <div className='mt-3 overflow-x-auto'>
                <table className='w-full text-left text-sm'>
                  <thead>
                    <tr className='border-b border-[var(--border-default)] text-xs uppercase tracking-wide text-[var(--text-muted)]'>
                      <th className='py-2 pr-4 font-medium'>Email</th>
                      <th className='py-2 pr-4 font-medium'>Signed up</th>
                      <th className='py-2 pr-4 font-medium'>Last seen</th>
                      <th className='py-2 pr-4 font-medium'>Plan</th>
                      <th className='py-2 font-medium'>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentSignups.map((u) => (
                      <tr
                        key={u.email + (u.createdAt ?? '')}
                        className='border-b border-[var(--border-default)] last:border-0'>
                        <td className='py-2 pr-4 text-[var(--text-primary)]'>
                          {u.email}
                        </td>
                        <td className='py-2 pr-4 text-[var(--text-secondary)]'>
                          {fmtDate(u.createdAt)}
                        </td>
                        <td className='py-2 pr-4 text-[var(--text-secondary)]'>
                          {fmtDate(u.lastSignInAt)}
                        </td>
                        <td className='py-2 pr-4 capitalize text-[var(--text-secondary)]'>
                          {u.plan ?? '—'}
                        </td>
                        <td className='py-2 capitalize text-[var(--text-secondary)]'>
                          {u.status ?? 'free'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
