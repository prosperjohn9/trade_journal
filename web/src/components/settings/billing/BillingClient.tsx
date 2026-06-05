'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import { useEntitlements } from '@/src/hooks/useEntitlements';
import { PLANS, PLAN_ORDER } from '@/src/lib/billing/plans';
import type { Entitlements } from '@/src/lib/billing/entitlements';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

const STATUS_LABEL: Record<Entitlements['status'], string> = {
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceling',
  expired: 'Expired',
  none: 'No plan',
};

function statusColor(status: Entitlements['status']): string {
  if (status === 'active' || status === 'trialing') return 'var(--profit)';
  if (status === 'past_due' || status === 'canceled') return '#f59e0b';
  return 'var(--text-muted)';
}

function syncEvery(hours: number): string {
  if (!hours) return 'n/a';
  return hours === 1 ? 'every hour' : `every ${hours} hours`;
}

function CurrentPlanCard({ e }: { e: Entitlements }) {
  const planName = e.plan ? PLANS[e.plan].name : null;
  const lifetime = e.daysLeft != null && e.daysLeft > 3650;
  const periodLabel = e.currentPeriodEnd
    ? new Date(e.currentPeriodEnd).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  let timing: string | null = null;
  if (e.isTrial && e.daysLeft != null) {
    timing = `Trial ends in ${e.daysLeft} ${e.daysLeft === 1 ? 'day' : 'days'}`;
  } else if (lifetime) {
    timing = 'Lifetime access';
  } else if (e.status === 'canceled' && periodLabel) {
    timing = `Access until ${periodLabel}, then ends`;
  } else if (periodLabel) {
    timing = `Renews ${periodLabel}`;
  }

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <div className='text-xs uppercase tracking-wide text-[var(--text-muted)]'>
            Current plan
          </div>
          <div className='mt-1 text-2xl font-semibold text-[var(--text-primary)]'>
            {planName ?? 'No active plan'}
          </div>
          {timing ? (
            <div className='mt-1 text-sm text-[var(--text-secondary)]'>
              {timing}
            </div>
          ) : null}
        </div>
        <span
          className='inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold'
          style={{
            color: statusColor(e.status),
            backgroundColor: `color-mix(in srgb, ${statusColor(e.status)} 16%, transparent)`,
          }}>
          {STATUS_LABEL[e.status]}
        </span>
      </div>

      {e.entitled ? (
        <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3'>
          <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div className='text-xs text-[var(--text-muted)]'>
              Synced accounts
            </div>
            <div className='text-lg font-semibold text-[var(--text-primary)]'>
              {e.limits.syncedAccounts}
            </div>
          </div>
          <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div className='text-xs text-[var(--text-muted)]'>Auto-sync</div>
            <div className='text-lg font-semibold text-[var(--text-primary)]'>
              {syncEvery(e.limits.syncIntervalHours)}
            </div>
          </div>
          <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div className='text-xs text-[var(--text-muted)]'>
              AI actions / mo
            </div>
            <div className='text-lg font-semibold text-[var(--text-primary)]'>
              {e.limits.aiActionsPerMonth.toLocaleString()}
            </div>
          </div>
        </div>
      ) : (
        <p className='mt-3 text-sm text-[var(--text-secondary)]'>
          You do not have an active plan. Start a 7-day trial to unlock broker
          sync, the behavioral AI, prop tracking, and advanced analytics.
        </p>
      )}
    </section>
  );
}

export function BillingClient() {
  const router = useRouter();
  const [theme, setTheme] = useState<DashboardTheme>('light');
  const [authChecked, setAuthChecked] = useState(false);
  const { entitlements, loading } = useEntitlements();

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

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto w-full max-w-[1280px] space-y-8 px-4 py-8 sm:px-6 lg:px-8'>
        <header className='flex flex-col gap-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-[2rem] font-semibold tracking-tight'>
              Billing &amp; Plan
            </h1>
            <p className='mt-1 text-sm text-[var(--text-secondary)]'>
              Your subscription, what it unlocks, and how to change it.
            </p>
          </div>
          <button
            className='rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            onClick={() => router.push('/settings')}>
            Back to settings
          </button>
        </header>

        {!authChecked || loading ? (
          <p className='text-sm text-[var(--text-secondary)]'>Loading...</p>
        ) : (
          <>
            <CurrentPlanCard e={entitlements} />

            <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <h2 className='text-lg font-semibold'>Plans</h2>
                <button
                  className='rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110'
                  onClick={() => router.push('/pricing')}>
                  {entitlements.entitled ? 'Change plan' : 'View plans'}
                </button>
              </div>

              <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3'>
                {PLAN_ORDER.map((id) => {
                  const p = PLANS[id];
                  const isCurrent = entitlements.plan === id;
                  return (
                    <div
                      key={id}
                      className='rounded-lg border p-4'
                      style={{
                        borderColor: isCurrent
                          ? 'var(--accent-cta)'
                          : 'var(--border-default)',
                      }}>
                      <div className='flex items-center justify-between'>
                        <div className='font-semibold'>{p.name}</div>
                        {isCurrent ? (
                          <span className='text-xs font-semibold text-[var(--accent-cta)]'>
                            Current
                          </span>
                        ) : null}
                      </div>
                      <div className='mt-1 text-sm text-[var(--text-secondary)]'>
                        ${p.priceMonthly}/mo
                      </div>
                      <div className='mt-2 text-xs text-[var(--text-muted)]'>
                        {p.syncedAccounts} synced, sync{' '}
                        {syncEvery(p.syncIntervalHours)},{' '}
                        {p.aiActionsPerMonth.toLocaleString()} AI/mo
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className='mt-4 text-xs text-[var(--text-muted)]'>
                Subscribe and manage billing (card via Flutterwave, crypto via
                NOWPayments) is being set up. Soon you will start a plan, add
                extra synced accounts, and cancel right here.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
