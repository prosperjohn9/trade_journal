'use client';

import { useEffect, useState } from 'react';
import { apiPost } from '@/src/lib/api/fetcher';
import { supabase } from '@/src/lib/supabase/client';
import {
  EXTRA_SYNC_PRICE_MONTHLY,
  GUARDRAIL_PRICE_MONTHLY,
} from '@/src/lib/billing/plans';

// Per-account add-ons: extra MetaTrader auto-sync ($6/account) and real-time
// Foresight seats ($18/account). One-period purchases; the buyer keeps the slots
// until the period ends, then renews manually. Both require a base plan.

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
type Kind = 'mt_sync' | 'guardrail';

const ADDONS: Array<{
  kind: Kind;
  title: string;
  desc: string;
  unit: number;
  noun: string;
}> = [
  {
    kind: 'mt_sync',
    title: 'Extra MetaTrader auto-sync',
    desc: 'Sync more than the one MetaTrader account your plan includes.',
    unit: EXTRA_SYNC_PRICE_MONTHLY,
    noun: 'account',
  },
  {
    kind: 'guardrail',
    title: 'Real-time Foresight (MetaTrader)',
    desc: 'Watch an account 24/7 and get an AI read on Telegram the instant you open a trade. Free on cTrader.',
    unit: GUARDRAIL_PRICE_MONTHLY,
    noun: 'seat',
  },
];

function labelFor(a: AddonRow): string {
  return a.kind === 'guardrail'
    ? `${a.quantity} Foresight seat${a.quantity === 1 ? '' : 's'}`
    : `${a.quantity} extra MetaTrader account${a.quantity === 1 ? '' : 's'}`;
}

function AddonPurchase({
  kind,
  title,
  desc,
  unit,
  noun,
  activeQty,
}: {
  kind: Kind;
  title: string;
  desc: string;
  unit: number;
  noun: string;
  activeQty: number;
}) {
  const [qty, setQty] = useState(1);
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [method, setMethod] = useState<Method>('card');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unitNow = unit * (cycle === 'yearly' ? 10 : 1);
  const total = unitNow * qty;
  const period = cycle === 'yearly' ? 'year' : 'month';

  async function buy() {
    setBusy(true);
    setErr(null);
    try {
      const { link } = await apiPost<{ link: string }>(
        '/api/billing/addons/checkout',
        { kind, quantity: qty, cycle, method },
      );
      window.location.href = link;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  }

  return (
    <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-4'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='max-w-md'>
          <div className='text-sm font-medium text-[var(--text-primary)]'>
            {title}
          </div>
          <div className='text-xs text-[var(--text-muted)]'>
            ${unit}/{noun}/month
            {activeQty > 0 ? ` · ${activeQty} active now` : ''}
          </div>
          <p className='mt-1 text-xs text-[var(--text-muted)]'>{desc}</p>
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
        Purchased per {period}; renew manually before it ends to keep it.
        Auto-renew is coming soon.
      </p>
      {err ? <p className='mt-2 text-xs text-[var(--loss)]'>{err}</p> : null}
    </div>
  );
}

export function AddonsCard({ entitled }: { entitled: boolean }) {
  const [active, setActive] = useState<AddonRow[]>([]);

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
          {ADDONS.map((a) => (
            <div
              key={a.kind}
              className='flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
              <div>
                <div className='text-sm font-medium text-[var(--text-secondary)]'>
                  {a.title}
                </div>
                <div className='text-xs text-[var(--text-muted)]'>
                  ${a.unit}/{a.noun}/month
                </div>
              </div>
              <span className='text-xs text-[var(--text-muted)]'>
                Plan required
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const qtyByKind = (k: Kind) =>
    active.filter((a) => a.kind === k).reduce((s, a) => s + a.quantity, 0);

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <h2 className='text-lg font-semibold'>Add-ons</h2>
      <p className='mt-1 text-xs text-[var(--text-muted)]'>
        Your plan includes 1 MetaTrader account and unlimited free cTrader sync.
        Add more, or turn on real-time Foresight, here.
      </p>

      <div className='mt-4 space-y-3'>
        {ADDONS.map((a) => (
          <AddonPurchase key={a.kind} {...a} activeQty={qtyByKind(a.kind)} />
        ))}
      </div>

      {active.length > 0 ? (
        <ul className='mt-4 divide-y divide-[var(--border-default)]'>
          {active.map((a) => (
            <li
              key={a.id}
              className='flex items-center justify-between py-2 text-sm'>
              <span className='text-[var(--text-secondary)]'>{labelFor(a)}</span>
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
