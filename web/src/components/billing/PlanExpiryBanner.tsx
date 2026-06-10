'use client';

import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/src/lib/api/fetcher';

// Shown on the dashboard when an entitled plan is ENDING soon (crypto plans
// never auto-renew; card plans the user has canceled). Renders nothing for
// auto-renewing or lifetime plans, or when the end is comfortably far away.

type Usage = {
  entitled: boolean;
  daysLeft: number | null;
  endsAt: string | null;
  willRenew: boolean;
  provider: string | null;
};

const SHOW_WITHIN_DAYS = 7;

export function PlanExpiryBanner() {
  const router = useRouter();
  const { data } = useSWR<Usage>('/api/billing/usage', apiFetch, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });

  if (
    !data ||
    !data.entitled ||
    data.willRenew ||
    data.daysLeft == null ||
    data.daysLeft > SHOW_WITHIN_DAYS
  ) {
    return null;
  }

  const endsLabel = data.endsAt
    ? new Date(data.endsAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : 'soon';
  const today = data.daysLeft <= 0;

  return (
    <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3'>
      <p className='text-sm text-[var(--text-primary)]'>
        <span className='font-semibold'>
          {today ? 'Your plan ends today.' : `Your plan ends ${endsLabel}.`}
        </span>{' '}
        <span className='text-[var(--text-secondary)]'>
          {data.provider === 'nowpayments'
            ? 'Crypto plans do not renew automatically. Renew now to keep broker sync and AI without interruption.'
            : 'Renew to keep broker sync and AI without interruption.'}
        </span>
      </p>
      <button
        type='button'
        onClick={() => router.push('/settings/billing')}
        className='shrink-0 rounded-lg bg-[var(--accent-cta)] px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110'>
        Renew plan
      </button>
    </div>
  );
}
