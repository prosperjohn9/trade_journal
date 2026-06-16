'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { apiFetch, apiPost } from '@/src/lib/api/fetcher';
import type {
  HindsightReport,
  LeakFinding,
} from '@/src/lib/analytics/hindsight';

/** Turn a Hindsight finding into a committed rule, then refresh the
 *  commitments card so the trader immediately sees it being tracked. */
function CommitButton({
  kind,
  subject,
  label,
}: {
  kind: string;
  subject?: string;
  label: string;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  async function commit() {
    setState('busy');
    try {
      await apiPost('/api/rules', { kind, subject, label });
      setState('done');
      void mutate('/api/rules');
    } catch (e) {
      if ((e as { status?: number })?.status === 409) {
        setState('done');
        void mutate('/api/rules');
      } else {
        setState('err');
      }
    }
  }
  if (state === 'done') {
    return (
      <span className='text-xs font-medium text-[var(--profit)]'>
        ✓ Committed, now tracking
      </span>
    );
  }
  return (
    <button
      type='button'
      onClick={() => void commit()}
      disabled={state === 'busy'}
      className='rounded-lg border border-[var(--accent-cta)]/50 px-2.5 py-1 text-xs font-medium text-[var(--accent-cta)] transition-colors hover:bg-[var(--accent-cta)]/10 disabled:opacity-60'>
      {state === 'busy'
        ? 'Committing...'
        : state === 'err'
          ? 'Try again'
          : 'Commit to this rule'}
    </button>
  );
}

// The flagship card: what this period actually cost you, in money, explained
// in plain English. Every finding answers three questions: what is the
// pattern, what is the evidence, and what should I do about it.

type Payload =
  | { insufficient: true; totalTrades: number; minTrades: number }
  | {
      insufficient: false;
      period: '30d' | 'all';
      currency: string;
      report: HindsightReport;
    };

function money(n: number, currency: string, signed = true): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      signDisplay: signed ? 'exceptZero' : 'auto',
    }).format(n);
  } catch {
    return `${n >= 0 && signed ? '+' : ''}${n.toFixed(0)} ${currency}`;
  }
}

function pnlColor(n: number): string {
  return n > 0 ? 'var(--profit)' : n < 0 ? 'var(--loss)' : 'var(--text-primary)';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Plain-English coaching copy per leak type: what happened, and one concrete
 *  rule to try. The card never shows a finding without explaining it. */
function copyFor(
  f: LeakFinding,
  currency: string,
): { explanation: string; advice: string } {
  const cost = money(f.cost, currency, false);
  const n = plural(f.tradeCount, 'trade');
  switch (f.kind) {
    case 'revenge':
      return {
        explanation: `${n} were opened within an hour of taking a loss, and together they lost ${cost}. That pattern is called revenge trading: the next trade tries to win the money back instead of waiting for a real setup.`,
        advice: 'After any losing trade, no new entry for at least one hour.',
      };
    case 'oversized':
      return {
        explanation: `Right after a loss, you sized up to 1.5x or more of your normal position on ${n}. At your normal size, those trades would have lost ${cost} less. Bigger bets at your worst moments.`,
        advice:
          'Hard rule: the trade after a loss can never be bigger than your usual size.',
      };
    case 'session':
      return {
        explanation: `Trades you open during the ${f.subject} session keep losing: ${n} cost you ${cost} this period. Whatever your edge is, it has not been showing up in those hours.`,
        advice: `Skip the ${f.subject} session for your next 20 trades, then compare your numbers.`,
      };
    case 'weekday':
      return {
        explanation: `Your ${f.subject} trading keeps losing: ${n} opened on ${f.subject}s cost you ${cost} this period. Something about how you trade that day is not working.`,
        advice: `Take the next two ${f.subject}s off. If your results improve, make it permanent.`,
      };
    case 'emotion':
      return {
        explanation: `Trades you yourself tagged "${f.subject}" lost ${cost} across ${n}. Your own journal is telling you which state of mind costs you money.`,
        advice:
          'When you notice that feeling, write it down and stop trading for the session.',
      };
  }
}

export function HindsightReportCard() {
  const { data } = useSWR<Payload>('/api/reports/hindsight', apiFetch, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });

  const periodLabel = (p: '30d' | 'all') =>
    p === '30d' ? 'last 30 days' : 'whole journal';

  return (
    <section className='border rounded-xl p-4 bg-[var(--bg-surface)] border-[var(--border-default)] space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h2 className='text-lg font-semibold'>Hindsight Report</h2>
          <p className='text-xs text-[var(--text-muted)]'>
            What your trading habits cost you, in money.
          </p>
        </div>
        {data && !data.insufficient ? (
          <span className='text-xs text-[var(--text-muted)]'>
            {data.period === '30d' ? 'Last 30 days' : 'All time'}
          </span>
        ) : null}
      </div>

      {!data ? (
        <p className='text-sm text-[var(--text-muted)]'>Loading...</p>
      ) : data.insufficient ? (
        <p className='text-sm text-[var(--text-secondary)]'>
          Log or sync at least {data.minTrades} trades and we will show you, in
          money, what your trading habits are costing you. You have{' '}
          {data.totalTrades}.
        </p>
      ) : !data.report.biggest ? (
        <p className='text-sm text-[var(--text-secondary)]'>
          No measurable behavioral leak in this period. Your losses look like
          normal strategy variance, not tilt. Keep doing what you are doing.
        </p>
      ) : (
        <>
          {(() => {
            const biggest = data.report.biggest;
            const c = copyFor(biggest, data.currency);
            return (
              <>
                <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
                  <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
                    <div className='text-xs text-[var(--text-muted)]'>
                      Your P&L ({periodLabel(data.period)})
                    </div>
                    <div
                      className='text-2xl font-semibold'
                      style={{ color: pnlColor(data.report.actualPnl) }}>
                      {money(data.report.actualPnl, data.currency)}
                    </div>
                  </div>
                  <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
                    <div className='text-xs text-[var(--text-muted)]'>
                      What it could have been
                    </div>
                    <div
                      className='text-2xl font-semibold'
                      style={{ color: pnlColor(biggest.counterfactualPnl) }}>
                      {money(biggest.counterfactualPnl, data.currency)}
                    </div>
                  </div>
                  <div className='rounded-lg border border-[var(--loss)]/40 bg-[var(--loss)]/[0.06] p-3'>
                    <div className='text-xs text-[var(--text-muted)]'>
                      Cost of your biggest leak
                    </div>
                    <div
                      className='text-2xl font-semibold'
                      style={{ color: 'var(--loss)' }}>
                      {money(-biggest.cost, data.currency)}
                    </div>
                  </div>
                </div>

                <div className='space-y-2'>
                  <p className='text-sm text-[var(--text-secondary)]'>
                    <span className='font-semibold text-[var(--text-primary)]'>
                      Your biggest leak: {biggest.label}.
                    </span>{' '}
                    {c.explanation}
                    {biggest.lowSample
                      ? ' The sample is small, so treat this as an early signal rather than a verdict.'
                      : ''}
                  </p>
                  <div className='rounded-lg border border-[var(--accent-cta)]/35 bg-[var(--accent-cta)]/[0.07] px-3 py-2'>
                    <p className='text-sm text-[var(--text-secondary)]'>
                      <span className='font-semibold text-[var(--text-primary)]'>
                        Try this:
                      </span>{' '}
                      {c.advice}
                    </p>
                    <div className='mt-2'>
                      <CommitButton
                        kind={biggest.kind}
                        subject={biggest.subject}
                        label={c.advice}
                      />
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          {data.report.findings.length > 1 ? (
            <div>
              <div className='text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]'>
                Smaller leaks
              </div>
              <ul className='mt-1 divide-y divide-[var(--border-default)]'>
                {data.report.findings.slice(1, 4).map((f) => {
                  const c = copyFor(f, data.currency);
                  return (
                    <li
                      key={f.kind + f.label}
                      className='flex items-start justify-between gap-3 py-2.5'>
                      <div className='min-w-0'>
                        <div className='text-sm font-medium text-[var(--text-primary)]'>
                          {f.label}
                        </div>
                        <p className='mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]'>
                          {c.explanation}
                          {f.lowSample
                            ? ' Small sample, treat it as an early signal.'
                            : ''}{' '}
                          <span className='text-[var(--text-muted)]'>
                            Fix: {c.advice}
                          </span>
                        </p>
                        <div className='mt-1.5'>
                          <CommitButton
                            kind={f.kind}
                            subject={f.subject}
                            label={c.advice}
                          />
                        </div>
                      </div>
                      <span
                        className='shrink-0 text-sm font-semibold'
                        style={{ color: 'var(--loss)' }}>
                        -{money(f.cost, data.currency, false)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <p className='border-t border-[var(--border-default)] pt-3 text-xs text-[var(--text-muted)]'>
            How this works: we recalculate your P&L with the flagged trades
            removed (or resized to your normal size). Leaks can overlap, so each
            cost stands alone. Directional, not a promise. Educational only,
            not financial advice.
          </p>
        </>
      )}
    </section>
  );
}
