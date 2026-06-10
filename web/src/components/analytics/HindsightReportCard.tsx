'use client';

import useSWR from 'swr';
import { apiFetch } from '@/src/lib/api/fetcher';
import type {
  HindsightReport,
  LeakFinding,
} from '@/src/lib/analytics/hindsight';

// The flagship card: what this period actually cost you, in money, and what it
// would have looked like without your biggest behavioral leak.

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

function FindingRow({
  f,
  currency,
}: {
  f: LeakFinding;
  currency: string;
}) {
  return (
    <li className='flex items-baseline justify-between gap-3 py-1.5'>
      <div className='min-w-0'>
        <span className='text-sm font-medium text-[var(--text-primary)]'>
          {f.label}
        </span>
        <span className='ml-2 text-xs text-[var(--text-muted)]'>
          {f.tradeCount} trades
          {f.lowSample ? ' · small sample' : ''}
        </span>
      </div>
      <span className='shrink-0 text-sm font-semibold' style={{ color: 'var(--loss)' }}>
        -{money(f.cost, currency, false)}
      </span>
    </li>
  );
}

export function HindsightReportCard() {
  const { data } = useSWR<Payload>('/api/reports/hindsight', apiFetch, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });

  return (
    <section className='border rounded-xl p-4 bg-[var(--bg-surface)] border-[var(--border-default)] space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-lg font-semibold'>Hindsight Report</h2>
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
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
              <div className='text-xs text-[var(--text-muted)]'>Your P&L</div>
              <div
                className='text-2xl font-semibold'
                style={{ color: pnlColor(data.report.actualPnl) }}>
                {money(data.report.actualPnl, data.currency)}
              </div>
            </div>
            <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
              <div className='text-xs text-[var(--text-muted)]'>
                Without your biggest leak
              </div>
              <div
                className='text-2xl font-semibold'
                style={{ color: pnlColor(data.report.biggest.counterfactualPnl) }}>
                {money(data.report.biggest.counterfactualPnl, data.currency)}
              </div>
            </div>
            <div className='rounded-lg border border-[var(--loss)]/40 bg-[var(--loss)]/[0.06] p-3'>
              <div className='text-xs text-[var(--text-muted)]'>
                {data.report.biggest.label} cost you
              </div>
              <div className='text-2xl font-semibold' style={{ color: 'var(--loss)' }}>
                {money(-data.report.biggest.cost, data.currency)}
              </div>
            </div>
          </div>

          <p className='text-sm text-[var(--text-secondary)]'>
            <span className='font-medium text-[var(--text-primary)]'>
              {data.report.biggest.label}:
            </span>{' '}
            {data.report.biggest.detail.toLowerCase()},{' '}
            {data.report.biggest.tradeCount} trades
            {data.report.biggest.lowSample
              ? ' (small sample, treat as an early signal)'
              : ''}
            .
          </p>

          {data.report.findings.length > 1 ? (
            <div>
              <div className='text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]'>
                Other leaks
              </div>
              <ul className='mt-1 divide-y divide-[var(--border-default)]'>
                {data.report.findings.slice(1, 4).map((f) => (
                  <FindingRow key={f.kind + f.label} f={f} currency={data.currency} />
                ))}
              </ul>
            </div>
          ) : null}

          <p className='border-t border-[var(--border-default)] pt-3 text-xs text-[var(--text-muted)]'>
            Counterfactuals remove or resize only the flagged trades; leaks can
            overlap, so costs are per-leak, not additive. Directional, not a
            promise. Educational only, not financial advice.
          </p>
        </>
      )}
    </section>
  );
}
