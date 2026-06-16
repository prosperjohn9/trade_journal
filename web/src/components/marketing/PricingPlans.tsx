'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import {
  EXTRA_SYNC_PRICE_MONTHLY,
  GUARDRAIL_PRICE_MONTHLY,
  PLAN_ORDER,
  PLANS,
  type BillingCycle,
  type PlanDef,
} from '@/src/lib/billing/plans';

const COMMON_FEATURES = [
  'Broker auto-sync (MT4 / MT5)',
  'Behavioral-leak AI insights',
  'Prop-firm challenge tracking',
  'Advanced analytics (R-multiple, sessions)',
  'Unlimited manual accounts',
];

const POPULAR: PlanDef['id'] = 'elite';

function highlights(p: PlanDef): string[] {
  return [
    'Unlimited cTrader auto-sync, free',
    `${p.syncedAccounts} MetaTrader account included`,
    'Unlimited file import (MT5, cTrader, more)',
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
      className='mt-0.5 h-4 w-4 shrink-0 text-indigo-400'>
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

export function PricingPlans() {
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setLoggedIn(Boolean(data.session));
    });
    return () => {
      active = false;
    };
  }, []);

  // Logged-in visitors subscribe on the billing page; everyone else signs up.
  function getStarted() {
    router.push(loggedIn ? '/settings/billing' : '/auth?mode=signup');
  }

  return (
    <div>
      {/* Billing-cycle toggle */}
      <div className='mx-auto mb-10 flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-sm'>
        <button
          onClick={() => setCycle('monthly')}
          className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
            cycle === 'monthly'
              ? 'bg-indigo-500 text-white'
              : 'text-slate-300 hover:text-white'
          }`}>
          Monthly
        </button>
        <button
          onClick={() => setCycle('yearly')}
          className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
            cycle === 'yearly'
              ? 'bg-indigo-500 text-white'
              : 'text-slate-300 hover:text-white'
          }`}>
          Yearly
          <span className='ml-1.5 text-xs text-emerald-300'>2 months free</span>
        </button>
      </div>

      <div className='grid grid-cols-1 gap-6 md:grid-cols-3'>
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const popular = id === POPULAR;
          const price = cycle === 'monthly' ? p.priceMonthly : p.priceYearly;
          const unit = cycle === 'monthly' ? '/mo' : '/yr';
          return (
            <div
              key={id}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                popular
                  ? 'border-indigo-400/60 bg-indigo-500/[0.07]'
                  : 'border-white/10 bg-white/[0.03]'
              }`}>
              {popular ? (
                <span className='absolute -top-3 left-6 rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white'>
                  Most popular
                </span>
              ) : null}

              <h3 className='text-lg font-semibold text-white'>{p.name}</h3>
              <p className='mt-1 text-sm text-slate-400'>{p.blurb}</p>

              <div className='mt-5 flex items-baseline gap-1'>
                <span className='text-4xl font-semibold tracking-tight text-white'>
                  ${price}
                </span>
                <span className='text-sm text-slate-400'>{unit}</span>
              </div>
              <p className='mt-1 text-xs text-slate-500'>
                {cycle === 'yearly'
                  ? `Billed $${p.priceYearly} per year`
                  : `or $${p.priceYearly}/yr (2 months free)`}
              </p>

              <button
                type='button'
                onClick={getStarted}
                className={`mt-6 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                  popular
                    ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                    : 'border border-white/15 text-white hover:bg-white/5'
                }`}>
                Get started
              </button>

              <ul className='mt-6 space-y-2.5 text-sm'>
                {highlights(p).map((h) => (
                  <li key={h} className='flex gap-2 font-medium text-slate-100'>
                    <Check />
                    {h}
                  </li>
                ))}
                {COMMON_FEATURES.map((f) => (
                  <li key={f} className='flex gap-2 text-slate-300'>
                    <Check />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className='mx-auto mt-8 max-w-2xl space-y-2 text-center text-xs text-slate-500'>
        <p>
          Prices are in US dollars. Your bank or card network shows the amount
          in your local currency at checkout. Extra MetaTrader accounts are $
          {EXTRA_SYNC_PRICE_MONTHLY}/account each; real-time breach Live Guard is
          ${GUARDRAIL_PRICE_MONTHLY}/account (free for cTrader). cTrader auto-sync
          is always free.
        </p>
        <p>
          <span className='font-medium text-slate-400'>Billing & renewal:</span>{' '}
          plans bill on the frequency you pick, monthly or yearly. Card
          subscriptions renew automatically each period until you cancel. Crypto
          payments and add-ons are charged once per period and do not auto-renew.
        </p>
        <p>
          <span className='font-medium text-slate-400'>Cancel anytime:</span> go
          to Settings, then Billing, and choose Cancel plan. Your access
          continues until the end of the period you already paid for; no further
          charges are made.
        </p>
      </div>
    </div>
  );
}
