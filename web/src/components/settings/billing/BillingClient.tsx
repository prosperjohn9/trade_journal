'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { apiFetch } from '@/src/lib/api/fetcher';
import { supabase } from '@/src/lib/supabase/client';
import { apiPost } from '@/src/lib/api/fetcher';
import { useEntitlements } from '@/src/hooks/useEntitlements';
import {
  PLANS,
  PLAN_ORDER,
  priceFor,
  type BillingCycle,
  type PlanDef,
  type PlanId,
} from '@/src/lib/billing/plans';
import type { Entitlements } from '@/src/lib/billing/entitlements';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

const STATUS_LABEL: Record<Entitlements['status'], string> = {
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceling',
  expired: 'Expired',
  none: 'No plan',
};

function statusColor(status: Entitlements['status']): string {
  if (status === 'active') return 'var(--profit)';
  if (status === 'past_due' || status === 'canceled') return '#f59e0b';
  return 'var(--text-muted)';
}

function syncLabel(hours: number): string {
  if (!hours) return 'n/a';
  if (hours >= 24) return 'Daily';
  return hours === 1 ? 'Hourly' : `Every ${hours}h`;
}

const COMMON_FEATURES = [
  'Broker auto-sync (MT4 / MT5)',
  'Behavioral-leak AI insights',
  'Prop-firm challenge tracking',
  'Advanced analytics (R-multiple, sessions)',
  'Unlimited manual accounts',
];

function planHighlights(p: PlanDef): string[] {
  return [
    'Unlimited cTrader auto-sync, free',
    `${p.syncedAccounts} MetaTrader account included`,
    `Daily auto-sync + ${p.manualRefreshesPerMonth} manual refreshes`,
    `${p.aiActionsPerMonth} AI actions / month`,
  ];
}

function Check() {
  return (
    <svg
      viewBox='0 0 20 20'
      fill='none'
      aria-hidden='true'
      className='mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-cta)]'>
      <path
        d='M4 10.5l3.5 3.5L16 6'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

type Usage = {
  entitled: boolean;
  aiUsed: number;
  aiLimit: number;
  refreshesUsed: number;
  refreshesLimit: number;
  daysLeft: number | null;
  willRenew: boolean;
  provider: string | null;
};

function Meter({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone =
    pct >= 100 ? 'var(--loss)' : pct >= 75 ? '#f59e0b' : 'var(--accent-cta)';
  return (
    <div className='mt-2'>
      <div className='h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]'>
        <div
          className='h-full rounded-full transition-all'
          style={{ width: `${pct}%`, backgroundColor: tone }}
        />
      </div>
      <div className='mt-1 text-[11px] text-[var(--text-muted)]'>
        {used} of {limit} used this month
      </div>
    </div>
  );
}

function CurrentPlanCard({ e, usage }: { e: Entitlements; usage: Usage | null }) {
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
  if (lifetime) {
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
        <div className='mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4'>
          <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div className='text-xs text-[var(--text-muted)]'>
              MetaTrader accounts
            </div>
            <div className='text-lg font-semibold text-[var(--text-primary)]'>
              {e.limits.syncedAccounts}
            </div>
          </div>
          <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div className='text-xs text-[var(--text-muted)]'>Auto-sync</div>
            <div className='text-lg font-semibold text-[var(--text-primary)]'>
              {syncLabel(e.limits.syncIntervalHours)}
            </div>
          </div>
          <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div className='text-xs text-[var(--text-muted)]'>
              Manual refreshes / mo
            </div>
            <div className='text-lg font-semibold text-[var(--text-primary)]'>
              {e.limits.manualRefreshesPerMonth}
            </div>
            {usage ? (
              <Meter
                used={usage.refreshesUsed}
                limit={usage.refreshesLimit || e.limits.manualRefreshesPerMonth}
              />
            ) : null}
          </div>
          <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div className='text-xs text-[var(--text-muted)]'>
              AI actions / mo
            </div>
            <div className='text-lg font-semibold text-[var(--text-primary)]'>
              {e.limits.aiActionsPerMonth.toLocaleString()}
            </div>
            {usage ? (
              <Meter
                used={usage.aiUsed}
                limit={usage.aiLimit || e.limits.aiActionsPerMonth}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <p className='mt-3 text-sm text-[var(--text-secondary)]'>
          You do not have an active plan. Subscribe to unlock broker sync, the
          behavioral AI, prop tracking, and advanced analytics.
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
  const { data: usage } = useSWR<Usage>(
    authChecked ? '/api/billing/usage' : null,
    apiFetch,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [method, setMethod] = useState<'card' | 'crypto'>('card');
  const [busy, setBusy] = useState<PlanId | 'cancel' | null>(null);
  // Client-only page (ssr: false), so reading the query once via a lazy
  // initializer is safe. Flutterwave appends a status on return, so a payment is
  // only "received" when that status is successful, not when the user cancelled.
  const [checkout] = useState<{
    succeeded: boolean;
    cancelled: boolean;
    crypto: boolean;
  }>(() => {
    if (typeof window === 'undefined') {
      return { succeeded: false, cancelled: false, crypto: false };
    }
    const p = new URLSearchParams(window.location.search);
    if (p.get('checkout') !== 'done') {
      return { succeeded: false, cancelled: false, crypto: false };
    }
    const s = (p.get('status') ?? '').toLowerCase();
    const succeeded = s === 'successful' || s === 'completed';
    return {
      succeeded,
      cancelled: !succeeded,
      crypto: p.get('method') === 'crypto',
    };
  });
  const [msg, setMsg] = useState<string | null>(() => {
    if (checkout.succeeded) {
      return checkout.crypto
        ? 'Crypto payment received. It settles on the blockchain, so your plan usually activates within a few minutes. This page will update automatically; you can also refresh.'
        : 'Payment received. Activating your plan, this can take a few seconds.';
    }
    if (checkout.cancelled) {
      return 'Checkout was not completed, so you were not charged. Pick a plan whenever you are ready.';
    }
    return null;
  });

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

  // Returning from checkout: the webhook activates the plan after the payment
  // settles, so revalidate until it shows up. Cards settle in seconds; crypto
  // needs on-chain confirmation, so it gets a much longer polling window.
  useEffect(() => {
    if (!checkout.succeeded) return;
    const schedule = checkout.crypto
      ? [0, 10_000, 30_000, 60_000, 120_000, 180_000, 240_000, 300_000]
      : [0, 3000, 6000, 10_000, 15_000];
    const timers = schedule.map((t) =>
      window.setTimeout(() => void mutate('subscription'), t),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [checkout]);

  async function subscribe(plan: PlanId) {
    setMsg(null);
    setBusy(plan);
    try {
      const { link } = await apiPost<{ link: string }>('/api/billing/checkout', {
        plan,
        cycle,
        method,
      });
      window.location.assign(link);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not start checkout.');
      setBusy(null);
    }
  }

  async function cancelPlan() {
    setMsg(null);
    setBusy('cancel');
    try {
      await apiPost('/api/billing/cancel', {});
      await mutate('subscription');
      setMsg('Your plan is set to cancel. You keep access until the period ends.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not cancel.');
    } finally {
      setBusy(null);
    }
  }

  const e = entitlements;
  const isLifetime = e.daysLeft != null && e.daysLeft > 3650;
  const canCancel = e.entitled && e.status === 'active' && !isLifetime;

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

        {msg ? (
          <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-secondary)]'>
            {msg}
          </div>
        ) : null}

        {!authChecked || loading ? (
          <p className='text-sm text-[var(--text-secondary)]'>Loading...</p>
        ) : (
          <>
            <CurrentPlanCard e={e} usage={usage ?? null} />

            {canCancel ? (
              <div className='flex justify-end'>
                <button
                  className='rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--loss)] hover:text-[var(--loss)] disabled:opacity-60'
                  onClick={() => void cancelPlan()}
                  disabled={busy !== null}>
                  {busy === 'cancel' ? 'Canceling...' : 'Cancel plan'}
                </button>
              </div>
            ) : null}

            <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <h2 className='text-lg font-semibold'>
                  {e.entitled ? 'Plans' : 'Choose a plan'}
                </h2>
                <div className='flex flex-wrap items-center gap-2'>
                  <div className='flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-app)] p-1 text-xs'>
                    <button
                      onClick={() => setCycle('monthly')}
                      className={`rounded-full px-3 py-1 font-medium transition-colors ${
                        cycle === 'monthly'
                          ? 'bg-[var(--accent-cta)] text-white'
                          : 'text-[var(--text-secondary)]'
                      }`}>
                      Monthly
                    </button>
                    <button
                      onClick={() => setCycle('yearly')}
                      className={`rounded-full px-3 py-1 font-medium transition-colors ${
                        cycle === 'yearly'
                          ? 'bg-[var(--accent-cta)] text-white'
                          : 'text-[var(--text-secondary)]'
                      }`}>
                      Yearly
                    </button>
                  </div>
                  <div className='flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-app)] p-1 text-xs'>
                    <button
                      onClick={() => setMethod('card')}
                      className={`rounded-full px-3 py-1 font-medium transition-colors ${
                        method === 'card'
                          ? 'bg-[var(--accent-cta)] text-white'
                          : 'text-[var(--text-secondary)]'
                      }`}>
                      Card
                    </button>
                    <button
                      onClick={() => setMethod('crypto')}
                      className={`rounded-full px-3 py-1 font-medium transition-colors ${
                        method === 'crypto'
                          ? 'bg-[var(--accent-cta)] text-white'
                          : 'text-[var(--text-secondary)]'
                      }`}>
                      Crypto
                    </button>
                  </div>
                </div>
              </div>

              {method === 'crypto' ? (
                <p className='mt-3 text-xs text-[var(--text-muted)]'>
                  Crypto plans are billed in USDT at the listed price (the $18
                  plan is exactly 18 USDT; other coins convert at checkout).
                  They cover one billing period and do not renew automatically:
                  pay again any time to extend, and paying early adds to your
                  remaining time. After you pay, activation takes a few minutes
                  while the network confirms the transaction.
                </p>
              ) : null}

              <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3'>
                {PLAN_ORDER.map((id) => {
                  const p = PLANS[id];
                  const isCurrent = e.plan === id && e.entitled;
                  return (
                    <div
                      key={id}
                      className='flex flex-col rounded-lg border p-4'
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
                        ${priceFor(id, cycle)}
                        {cycle === 'monthly' ? '/mo' : '/yr'}
                      </div>
                      <p className='mt-1 text-xs text-[var(--text-muted)]'>
                        {p.blurb}
                      </p>

                      <ul className='mt-3 flex-1 space-y-1.5 text-xs text-[var(--text-secondary)]'>
                        {planHighlights(p).map((h) => (
                          <li key={h} className='flex gap-1.5'>
                            <Check />
                            <span className='font-medium text-[var(--text-primary)]'>
                              {h}
                            </span>
                          </li>
                        ))}
                        {COMMON_FEATURES.map((f) => (
                          <li key={f} className='flex gap-1.5'>
                            <Check />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>

                      <div className='mt-4'>
                        {isCurrent ? (
                          <button
                            disabled
                            className='w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-muted)]'>
                            Current plan
                          </button>
                        ) : e.entitled ? (
                          <button
                            disabled
                            title='Cancel your current plan first to switch'
                            className='w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-muted)]'>
                            Cancel first to switch
                          </button>
                        ) : (
                          <button
                            onClick={() => void subscribe(id)}
                            disabled={busy !== null}
                            className='w-full rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
                            {busy === id ? 'Starting...' : 'Subscribe'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className='mt-4 text-xs text-[var(--text-muted)]'>
                Card payments are processed securely by Flutterwave; crypto by
                NOWPayments (300+ coins). Cancel anytime, no lock-in. Yearly is
                two months free.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
