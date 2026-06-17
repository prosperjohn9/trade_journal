'use client';

import { useState } from 'react';
import { apiPost } from '@/src/lib/api/fetcher';

// On-demand Live Guard. Reads a live open position on the connected MetaTrader
// account and returns a grounded second opinion (signals + an AI heads-up). The
// always-on worker will later fire this the instant a trade opens; this panel
// proves it against a real position now.

type Severity = 'info' | 'caution' | 'warning';
type Sig = { id: string; severity: Severity; title: string; detail: string };
type Result = {
  position: {
    symbol: string;
    side: 'BUY' | 'SELL';
    entry: number;
    stopLoss: number | null;
    takeProfit: number | null;
    volume: number;
  };
  signals: Sig[];
  summary: string;
};

const SEV_STYLE: Record<Severity, { dot: string; label: string }> = {
  warning: { dot: 'var(--loss)', label: 'Warning' },
  caution: { dot: '#f59e0b', label: 'Caution' },
  info: { dot: 'var(--text-muted)', label: 'Note' },
};

export function LiveGuardPanel({ accountId }: { accountId?: string }) {
  const [checkNews, setCheckNews] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {};
      if (accountId && accountId !== 'all') body.accountId = accountId;
      if (checkNews) {
        body.newsRule = {
          enabled: true,
          minutesBefore: 5,
          minutesAfter: 5,
          penalty: { kind: 'breach' },
        };
      }
      const r = await apiPost<Result>('/api/guard/analyze', body);
      setRes(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not analyze.');
      setRes(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className='rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]'>
            Live Guard
            <span className='rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]'>
              Beta
            </span>
          </h2>
          <p className='mt-1 text-xs text-[var(--text-muted)]'>
            A grounded second opinion on a live open position: trend, risk,
            structure, spread, news and your own leaks.
          </p>
        </div>
        <button
          onClick={() => void run()}
          disabled={busy}
          className='rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
          {busy ? 'Reading your trade...' : 'Run Live Guard'}
        </button>
      </div>

      <label className='mt-3 flex w-fit items-center gap-2 text-xs text-[var(--text-secondary)]'>
        <input
          type='checkbox'
          checked={checkNews}
          onChange={(e) => setCheckNews(e.target.checked)}
        />
        Check high-impact news (5 min window, breach rule) for this test
      </label>

      {err ? (
        <p className='mt-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-secondary)]'>
          {err}
        </p>
      ) : null}

      {res ? (
        <div className='mt-4 space-y-4'>
          <div className='text-xs text-[var(--text-muted)]'>
            {res.position.side === 'BUY' ? 'Long' : 'Short'}{' '}
            <span className='font-semibold text-[var(--text-secondary)]'>
              {res.position.symbol}
            </span>{' '}
            {res.position.volume} lots, entry {res.position.entry}
            {res.position.stopLoss != null
              ? `, stop ${res.position.stopLoss}`
              : ', no stop'}
            {res.position.takeProfit != null
              ? `, target ${res.position.takeProfit}`
              : ''}
          </div>

          <p className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-4 text-sm leading-relaxed text-[var(--text-primary)]'>
            {res.summary}
          </p>

          {res.signals.length > 0 ? (
            <ul className='space-y-2'>
              {res.signals.map((s) => (
                <li
                  key={s.id}
                  className='flex gap-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
                  <span
                    className='mt-1.5 h-2 w-2 shrink-0 rounded-full'
                    style={{ backgroundColor: SEV_STYLE[s.severity].dot }}
                  />
                  <div>
                    <div className='text-sm font-medium text-[var(--text-primary)]'>
                      {s.title}
                    </div>
                    <div className='text-xs text-[var(--text-muted)]'>
                      {s.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-xs text-[var(--text-muted)]'>
              Nothing flagged: structure, risk and timing all look in line.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
