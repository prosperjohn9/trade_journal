'use client';

import { useEffect, useState } from 'react';
import { apiPost } from '@/src/lib/api/fetcher';
import { supabase } from '@/src/lib/supabase/client';
import {
  EXTRA_SYNC_PRICE_MONTHLY,
  GUARDRAIL_PRICE_MONTHLY,
} from '@/src/lib/billing/plans';

// Per-account add-ons. v1 sells the extra-MetaTrader-sync add-on (the guardrail
// is shown as "coming" until the monitoring worker ships). One-period purchase:
// the buyer keeps the extra slots until the period ends, then renews manually.

type AddonRow = {
  id: string;
  kind: string;
  quantity: number;
  billing_cycle: 'monthly' | 'yearly';
  status: string;
  current_period_end: string | null;
};

type Cycle = 'monthly' | 'yearly';
type Method = 'card' | 'crypto';

export function AddonsCard({ entitled }: { entitled: boolean }) {
  const [active, setActive] = useState<AddonRow[]>([]);
  const [qty, setQty] = useState(1);
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [method, setMethod] = useState<Method>('card');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!entitled) return;
    let cancelled = false;
    void supabase
      .from('subscription_addons')
      .select('id, kind, quantity, billing_cycle, status, current_period_end')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setActive((data ?? []) as AddonRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [entitled]);

  // Free / lapsed users still see what add-ons exist (a selling point), greyed
  // out, with a nudge to start a plan. Add-ons require a base plan to buy.
  if (!entitled) {
    return (
      <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
        <h2 className='text-lg font-semibold'>Add-ons</h2>
        <p className='mt-1 text-xs text-[var(--text-muted)]'>
          Available on any plan. Start a plan to unlock these.
        </p>
        <div className='mt-4 space-y-2 opacity-70'>
          <div className='flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div>
              <div className='text-sm font-medium text-[var(--text-secondary)]'>
                Extra MetaTrader auto-sync
              </div>
              <div className='text-xs text-[var(--text-muted)]'>
                ${EXTRA_SYNC_PRICE_MONTHLY}/account/month
              </div>
            </div>
            <span className='text-xs text-[var(--text-muted)]'>Plan required</span>
          </div>
          <div className='flex items-center justify-between rounded-lg border border-dashed border-[var(--border-default)] p-3'>
            <div>
              <div className='text-sm font-medium text-[var(--text-secondary)]'>
                Live Guard (real-time AI second opinion)
              </div>
              <div className='text-xs text-[var(--text-muted)]'>
                ${GUARDRAIL_PRICE_MONTHLY}/MetaTrader account, free on cTrader
              </div>
            </div>
            <span className='text-xs text-[var(--text-muted)]'>Coming soon</span>
          </div>
        </div>
      </section>
    );
  }

  const unit = EXTRA_SYNC_PRICE_MONTHLY * (cycle === 'yearly' ? 10 : 1);
  const total = unit * qty;
  const period = cycle === 'yearly' ? 'year' : 'month';

  async function buy() {
    setBusy(true);
    setErr(null);
    try {
      const { link } = await apiPost<{ link: string }>(
        '/api/billing/addons/checkout',
        { kind: 'mt_sync', quantity: qty, cycle, method },
      );
      window.location.href = link;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  }

  const activeSync = active
    .filter((a) => a.kind === 'mt_sync')
    .reduce((s, a) => s + a.quantity, 0);

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <h2 className='text-lg font-semibold'>Add-ons</h2>
      <p className='mt-1 text-xs text-[var(--text-muted)]'>
        Your plan includes 1 MetaTrader account and unlimited free cTrader sync.
        Add more MetaTrader accounts here.
      </p>

      <div className='mt-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div>
            <div className='text-sm font-medium text-[var(--text-primary)]'>
              Extra MetaTrader auto-sync
            </div>
            <div className='text-xs text-[var(--text-muted)]'>
              ${EXTRA_SYNC_PRICE_MONTHLY}/account/month
              {activeSync > 0 ? ` · ${activeSync} active now` : ''}
            </div>
          </div>

          <div className='flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] p-1 text-xs'>
            {(['monthly', 'yearly'] as Cycle[]).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`rounded-full px-3 py-1 font-medium capitalize transition-colors ${
                  cycle === c
                    ? 'bg-[var(--accent-cta)] text-white'
                    : 'text-[var(--text-secondary)]'
                }`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className='mt-4 flex flex-wrap items-center gap-3'>
          <div className='flex items-center rounded-lg border border-[var(--border-default)]'>
            <button
              aria-label='Decrease'
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className='px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'>
              −
            </button>
            <span className='w-8 text-center text-sm font-semibold'>{qty}</span>
            <button
              aria-label='Increase'
              onClick={() => setQty((q) => Math.min(20, q + 1))}
              className='px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'>
              +
            </button>
          </div>

          <div className='flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] p-1 text-xs'>
            {(['card', 'crypto'] as Method[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded-full px-3 py-1 font-medium capitalize transition-colors ${
                  method === m
                    ? 'bg-[var(--accent-cta)] text-white'
                    : 'text-[var(--text-secondary)]'
                }`}>
                {m}
              </button>
            ))}
          </div>

          <div className='ml-auto text-sm'>
            <span className='font-semibold text-[var(--text-primary)]'>
              ${total}
            </span>
            <span className='text-[var(--text-muted)]'>/{period}</span>
          </div>

          <button
            onClick={() => void buy()}
            disabled={busy}
            className='rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
            {busy ? 'Starting...' : 'Buy'}
          </button>
        </div>

        <p className='mt-3 text-[11px] text-[var(--text-muted)]'>
          Purchased per {period}; renew manually before it ends to keep the
          accounts. Auto-renew is coming soon.
        </p>
        {err ? <p className='mt-2 text-xs text-[var(--loss)]'>{err}</p> : null}
      </div>

      <div className='mt-3 rounded-lg border border-dashed border-[var(--border-default)] p-3'>
        <div className='text-sm font-medium text-[var(--text-secondary)]'>
          Live Guard (real-time breach protection)
        </div>
        <div className='text-xs text-[var(--text-muted)]'>
          ${GUARDRAIL_PRICE_MONTHLY}/MetaTrader account, free for cTrader.
          Coming soon.
        </div>
      </div>

      {active.length > 0 ? (
        <ul className='mt-4 divide-y divide-[var(--border-default)]'>
          {active.map((a) => (
            <li
              key={a.id}
              className='flex items-center justify-between py-2 text-sm'>
              <span className='text-[var(--text-secondary)]'>
                {a.quantity} extra MetaTrader account
                {a.quantity === 1 ? '' : 's'}
              </span>
              <span className='text-xs text-[var(--text-muted)]'>
                {a.current_period_end
                  ? `Until ${new Date(a.current_period_end).toLocaleDateString()}`
                  : 'Active'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
