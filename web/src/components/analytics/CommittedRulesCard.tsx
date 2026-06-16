'use client';

import useSWR from 'swr';
import { apiFetch, apiDelete } from '@/src/lib/api/fetcher';
import type { RuleProgress } from '@/src/lib/analytics/commitment';

// The receipts. Each rule the trader committed to (from a Hindsight leak), with
// how they have done against it since, and the money kept by breaking it less.

type Rule = {
  id: string;
  kind: string;
  subject: string | null;
  label: string;
  committedAt: string;
  progress: RuleProgress;
};

type Payload = { currency: string; rules: Rule[] };

function money(n: number, currency: string, signed = false): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      signDisplay: signed ? 'exceptZero' : 'auto',
    }).format(n);
  } catch {
    return `${signed && n > 0 ? '+' : ''}${n.toFixed(0)} ${currency}`;
  }
}

function rate(n: number): string {
  return n.toFixed(1);
}

export function CommittedRulesCard() {
  const { data, mutate } = useSWR<Payload>('/api/rules', apiFetch, {
    revalidateOnFocus: false,
  });

  if (!data || data.rules.length === 0) return null;

  async function drop(id: string) {
    await apiDelete(`/api/rules/${id}`).catch(() => {});
    await mutate();
  }

  const currency = data.currency;

  return (
    <section className='space-y-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
      <div>
        <h2 className='text-lg font-semibold'>Your commitments</h2>
        <p className='text-xs text-[var(--text-muted)]'>
          Rules you committed to, tracked automatically from your trades, and
          what sticking to them is worth.
        </p>
      </div>

      <ul className='space-y-3'>
        {data.rules.map((r) => {
          const p = r.progress;
          const saved = p.estimatedSaved >= 1;
          return (
            <li
              key={r.id}
              className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
              <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <div className='text-sm font-medium text-[var(--text-primary)]'>
                    {r.label}
                  </div>
                  <div className='text-xs text-[var(--text-muted)]'>
                    Committed{' '}
                    {p.trackingDays === 0
                      ? 'today'
                      : `${p.trackingDays} day${p.trackingDays === 1 ? '' : 's'} ago`}
                  </div>
                </div>
                <button
                  type='button'
                  onClick={() => void drop(r.id)}
                  aria-label='Drop rule'
                  className='shrink-0 rounded px-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--loss)]'>
                  Drop
                </button>
              </div>

              {!p.hasTrackingData ? (
                <p className='mt-2 text-xs text-[var(--text-secondary)]'>
                  Tracking from today. Your next trades will show here whether
                  you are keeping to it.
                </p>
              ) : (
                <div className='mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3'>
                  <Stat
                    label='Breaks since'
                    value={String(p.breachesSince)}
                    sub={
                      p.breachImpactSince < 0
                        ? `${money(p.breachImpactSince, currency)} so far`
                        : undefined
                    }
                    tone={p.breachesSince > 0 ? 'loss' : 'neutral'}
                  />
                  {p.hasBaseline ? (
                    <Stat
                      label='Per week'
                      value={`${rate(p.baselinePerWeek)} → ${rate(p.currentPerWeek)}`}
                      sub={
                        p.currentPerWeek < p.baselinePerWeek
                          ? 'improving'
                          : p.currentPerWeek > p.baselinePerWeek
                            ? 'slipping'
                            : 'holding'
                      }
                      tone={
                        p.currentPerWeek < p.baselinePerWeek
                          ? 'profit'
                          : p.currentPerWeek > p.baselinePerWeek
                            ? 'loss'
                            : 'neutral'
                      }
                    />
                  ) : null}
                  {saved ? (
                    <Stat
                      label='Estimated saved'
                      value={money(p.estimatedSaved, currency)}
                      sub='vs your old rate'
                      tone='profit'
                    />
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className='border-t border-[var(--border-default)] pt-3 text-xs text-[var(--text-muted)]'>
        Estimated savings compare your pace since committing against your
        historical rate. Directional, not a promise. Educational only, not
        financial advice.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'profit' | 'loss' | 'neutral';
}) {
  const color =
    tone === 'profit'
      ? 'var(--profit)'
      : tone === 'loss'
        ? 'var(--loss)'
        : 'var(--text-primary)';
  return (
    <div>
      <div className='text-xs text-[var(--text-muted)]'>{label}</div>
      <div className='text-lg font-semibold' style={{ color }}>
        {value}
      </div>
      {sub ? <div className='text-[11px] text-[var(--text-muted)]'>{sub}</div> : null}
    </div>
  );
}
