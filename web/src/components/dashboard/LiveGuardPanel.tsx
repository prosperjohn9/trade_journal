'use client';

import { useEffect, useState } from 'react';
import { apiPost } from '@/src/lib/api/fetcher';
import { supabase } from '@/src/lib/supabase/client';
import { TF_VALUES, tfLabel, type Tf } from '@/src/lib/analytics/timeframes';

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

  // The connected MetaTrader accounts the user can analyze, with a picker, so
  // they target the right account regardless of the dashboard's top filter.
  const [accounts, setAccounts] = useState<{ accountId: string; name: string }[]>(
    [],
  );
  const [selected, setSelected] = useState('');

  // Optional context: more given = sharper read.
  const [analyzedTf, setAnalyzedTf] = useState<Tf | ''>('');
  const [executedTf, setExecutedTf] = useState<Tf | ''>('');
  const [setups, setSetups] = useState<{ id: string; name: string }[]>([]);
  const [setupId, setSetupId] = useState('');

  const selectCls =
    'rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none';

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('setup_templates')
      .select('id, name')
      .then(({ data }) => {
        if (!cancelled) {
          setSetups((data ?? []) as { id: string; name: string }[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('mt_connections')
      .select('account_id, state, account:accounts(name)')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as Array<{
          account_id: string;
          state: string | null;
          account: { name: string } | { name: string }[] | null;
        }>;
        // Filter in JS so a NULL state is kept (a Postgres .neq would drop it).
        // Exclude only the genuinely dead states, and dedupe by account.
        const dead = new Set(['breached', 'over_limit']);
        const seen = new Set<string>();
        const list: { accountId: string; name: string }[] = [];
        for (const r of rows) {
          if (dead.has(r.state ?? '')) continue;
          if (seen.has(r.account_id)) continue;
          seen.add(r.account_id);
          list.push({
            accountId: r.account_id,
            name: Array.isArray(r.account)
              ? (r.account[0]?.name ?? 'Account')
              : (r.account?.name ?? 'Account'),
          });
        }
        setAccounts(list);
        setSelected(
          (prev) =>
            prev ||
            (accountId &&
            accountId !== 'all' &&
            list.some((a) => a.accountId === accountId)
              ? accountId
              : (list[0]?.accountId ?? '')),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function run(wake = false) {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {};
      if (wake) body.wake = true;
      if (selected) body.accountId = selected;
      if (analyzedTf) body.analyzedTf = analyzedTf;
      if (executedTf) body.executedTf = executedTf;
      if (setupId) body.setupId = setupId;
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
            Foresight
            <span className='rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]'>
              Beta
            </span>
          </h2>
          <p className='mt-1 text-xs text-[var(--text-muted)]'>
            A grounded second opinion on a live open position: trend, risk,
            structure, spread, news and your own leaks.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            onClick={() => void run(false)}
            disabled={busy}
            className='rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
            {busy ? 'Reading your trade...' : 'Run Foresight'}
          </button>
          <button
            onClick={() => void run(true)}
            disabled={busy}
            className='rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60'>
            Wake and analyze
          </button>
        </div>
      </div>

      {accounts.length > 0 ? (
        <div className='mt-3'>
          <div className='flex items-center gap-2'>
            <label className='text-xs text-[var(--text-muted)]'>Account</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none'>
              {accounts.map((a) => (
                <option key={a.accountId} value={a.accountId}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <p className='mt-1 text-[11px] text-[var(--text-muted)]'>
            MetaTrader-connected accounts only. If the account with your open
            trade is not here, connect it via MetaTrader in Settings first.
          </p>
        </div>
      ) : (
        <p className='mt-3 text-xs text-[var(--text-muted)]'>
          No MetaTrader-connected account yet. Foresight reads live positions
          through MetaApi, so connect the account your trade is on (Settings,
          then Connect MetaTrader with the investor password).
        </p>
      )}

      <div className='mt-3 flex flex-wrap items-center gap-x-4 gap-y-2'>
        <label className='flex items-center gap-2 text-xs text-[var(--text-muted)]'>
          Analyzed
          <select
            value={analyzedTf}
            onChange={(e) => setAnalyzedTf(e.target.value as Tf | '')}
            className={selectCls}>
            <option value=''>Day trader (1H + 4H)</option>
            {TF_VALUES.map((t) => (
              <option key={t} value={t}>
                {tfLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className='flex items-center gap-2 text-xs text-[var(--text-muted)]'>
          Executed
          <select
            value={executedTf}
            onChange={(e) => setExecutedTf(e.target.value as Tf | '')}
            className={selectCls}>
            <option value=''>Not set</option>
            {TF_VALUES.map((t) => (
              <option key={t} value={t}>
                {tfLabel(t)}
              </option>
            ))}
          </select>
        </label>
        {setups.length > 0 ? (
          <label className='flex items-center gap-2 text-xs text-[var(--text-muted)]'>
            Setup
            <select
              value={setupId}
              onChange={(e) => setSetupId(e.target.value)}
              className={selectCls}>
              <option value=''>No setup</option>
              {setups.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <p className='mt-1 text-[11px] text-[var(--text-muted)]'>
        Optional. The more you tell Foresight (timeframe, setup), the sharper the
        read.
      </p>

      <label className='mt-3 flex w-fit items-center gap-2 text-xs text-[var(--text-secondary)]'>
        <input
          type='checkbox'
          checked={checkNews}
          onChange={(e) => setCheckNews(e.target.checked)}
        />
        Check high-impact news (5 min window, breach rule) for this test
      </label>

      <p className='mt-2 text-[11px] text-[var(--text-muted)]'>
        Run Foresight reads the trade only if the account is already live. Wake
        and analyze briefly deploys a cold account (about $0.08) to read your
        open trade, then powers it back down.
      </p>

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
