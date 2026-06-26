'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';
import { apiPost, isUpgradeError } from '@/src/lib/api/fetcher';
import { UpgradePrompt } from '@/src/components/ui/UpgradePrompt';
import { TF_VALUES, tfLabel, type Tf } from '@/src/lib/analytics/timeframes';

// Pre-trade Foresight: paste a planned trade, get a grounded read (your own
// leaks, committed rules, prop buffer, session, pair record, news, R:R + the
// technical read) BEFORE you enter. The technical half pulls candles from your
// connected broker; an idle account can be briefly woken for it. Same brain as
// the live co-pilot. Metered like any AI action.

type Severity = 'info' | 'caution' | 'warning';
type Sig = { id: string; severity: Severity; title: string; detail: string };
type Result = {
  tldr: string;
  signals: Sig[];
  summary: string;
  suggestion?: string | null;
  technicalIncluded?: boolean;
  technicalNote?: string | null;
};

const SEV_DOT: Record<string, string> = {
  warning: 'var(--loss)',
  caution: '#f59e0b',
  info: 'var(--text-muted)',
};

const field =
  'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]';

export function PreTradeCheck() {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [setups, setSetups] = useState<{ id: string; name: string }[]>([]);

  const [accountId, setAccountId] = useState('');
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [size, setSize] = useState('');
  const [risk, setRisk] = useState('');
  const [analyzedTf, setAnalyzedTf] = useState<Tf | ''>('');
  const [executedTf, setExecutedTf] = useState<Tf | ''>('');
  const [setupId, setSetupId] = useState('');
  const [wake, setWake] = useState(false);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data: accts }, { data: tpls }] = await Promise.all([
        supabase.from('accounts').select('id, name').eq('archived', false),
        supabase.from('setup_templates').select('id, name'),
      ]);
      if (cancelled) return;
      const a = (accts ?? []) as { id: string; name: string }[];
      setAccounts(a);
      setSetups((tpls ?? []) as { id: string; name: string }[]);
      if (a.length && !accountId) setAccountId(a[0].id);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const num = (s: string): number | undefined => {
    const n = Number(s);
    return s.trim() !== '' && Number.isFinite(n) ? n : undefined;
  };

  async function check() {
    setMsg(null);
    setUpgradeMsg(null);
    if (!accountId || !symbol.trim() || num(entry) == null || num(size) == null) {
      setMsg('Account, symbol, entry and size are required.');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await apiPost<Result>('/api/guard/precheck', {
        accountId,
        symbol: symbol.trim(),
        side,
        entry: num(entry),
        stopLoss: num(stop),
        takeProfit: num(target),
        volume: num(size),
        riskMoney: num(risk),
        analyzedTf: analyzedTf || undefined,
        executedTf: executedTf || undefined,
        setupId: setupId || undefined,
        wake,
      });
      setResult(r);
    } catch (e) {
      if (isUpgradeError(e)) setUpgradeMsg(e.message);
      else setMsg(e instanceof Error ? e.message : 'Pre-trade check failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <h2 className='text-lg font-semibold text-[var(--text-primary)]'>
        Check a planned trade
      </h2>
      <p className='mt-1 text-sm text-[var(--text-secondary)]'>
        A grounded read before you enter: trend and structure (where your stop
        and target sit), your own leaks, committed rules, prop buffer, session,
        pair record, news and reward-to-risk.
      </p>

      <div className='mt-4 grid grid-cols-2 gap-3 md:grid-cols-3'>
        <label className='col-span-2 block text-xs text-[var(--text-muted)] md:col-span-1'>
          Account
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={`mt-1 ${field}`}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className='block text-xs text-[var(--text-muted)]'>
          Symbol
          <input
            className={`mt-1 ${field}`}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder='EURUSD'
          />
        </label>
        <label className='block text-xs text-[var(--text-muted)]'>
          Side
          <select
            value={side}
            onChange={(e) => setSide(e.target.value === 'SELL' ? 'SELL' : 'BUY')}
            className={`mt-1 ${field}`}>
            <option value='BUY'>Buy / Long</option>
            <option value='SELL'>Sell / Short</option>
          </select>
        </label>
        <label className='block text-xs text-[var(--text-muted)]'>
          Entry
          <input
            className={`mt-1 ${field}`}
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            type='number'
            step='any'
            placeholder='1.0850'
          />
        </label>
        <label className='block text-xs text-[var(--text-muted)]'>
          Stop loss
          <input
            className={`mt-1 ${field}`}
            value={stop}
            onChange={(e) => setStop(e.target.value)}
            type='number'
            step='any'
            placeholder='optional'
          />
        </label>
        <label className='block text-xs text-[var(--text-muted)]'>
          Take profit
          <input
            className={`mt-1 ${field}`}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            type='number'
            step='any'
            placeholder='optional'
          />
        </label>
        <label className='block text-xs text-[var(--text-muted)]'>
          Size (lots)
          <input
            className={`mt-1 ${field}`}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            type='number'
            step='any'
            placeholder='0.10'
          />
        </label>
        <label className='block text-xs text-[var(--text-muted)]'>
          Risk ({'$'}, optional)
          <input
            className={`mt-1 ${field}`}
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            type='number'
            step='any'
            placeholder='for % of account'
          />
        </label>
        <label className='block text-xs text-[var(--text-muted)]'>
          Analyzed timeframe
          <select
            value={analyzedTf}
            onChange={(e) => setAnalyzedTf(e.target.value as Tf | '')}
            className={`mt-1 ${field}`}>
            <option value=''>Default (1H + 4H)</option>
            {TF_VALUES.map((t) => (
              <option key={t} value={t}>
                {tfLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className='block text-xs text-[var(--text-muted)]'>
          Execution timeframe
          <select
            value={executedTf}
            onChange={(e) => setExecutedTf(e.target.value as Tf | '')}
            className={`mt-1 ${field}`}>
            <option value=''>Not set</option>
            {TF_VALUES.map((t) => (
              <option key={t} value={t}>
                {tfLabel(t)}
              </option>
            ))}
          </select>
        </label>
        {setups.length > 0 ? (
          <label className='block text-xs text-[var(--text-muted)]'>
            Setup
            <select
              value={setupId}
              onChange={(e) => setSetupId(e.target.value)}
              className={`mt-1 ${field}`}>
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

      <label className='mt-4 flex items-start gap-2 text-xs text-[var(--text-secondary)]'>
        <input
          type='checkbox'
          className='mt-0.5 h-4 w-4 shrink-0'
          checked={wake}
          onChange={(e) => setWake(e.target.checked)}
        />
        <span>
          Wake the account for the technical read. If this account is idle, tick
          this to briefly connect it (about 30s) so I can read live trend and
          structure. Guarded accounts are always live, so you can leave it off.
        </span>
      </label>

      <button
        onClick={() => void check()}
        disabled={busy}
        className='mt-4 rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
        {busy ? (wake ? 'Waking and reading…' : 'Reading…') : 'Check this trade'}
      </button>

      {upgradeMsg ? (
        <div className='mt-3'>
          <UpgradePrompt message={upgradeMsg} compact />
        </div>
      ) : null}
      {msg ? (
        <p className='mt-3 rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]'>
          {msg}
        </p>
      ) : null}

      {result ? (
        <div className='mt-4 border-t border-[var(--border-default)] pt-4'>
          <p className='text-sm font-semibold text-[var(--text-primary)]'>
            {result.tldr}
          </p>
          {result.technicalNote ? (
            <p className='mt-2 rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]'>
              {result.technicalNote}
            </p>
          ) : result.technicalIncluded ? (
            <p className='mt-2 text-xs text-[var(--text-muted)]'>
              Technical read included (live broker candles).
            </p>
          ) : null}
          {result.signals.length > 0 ? (
            <ul className='mt-3 space-y-2'>
              {result.signals.map((s) => (
                <li
                  key={s.id}
                  className='flex gap-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
                  <span
                    className='mt-1.5 h-2 w-2 shrink-0 rounded-full'
                    style={{ backgroundColor: SEV_DOT[s.severity] ?? 'var(--text-muted)' }}
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
          ) : null}
          {result.summary ? (
            <p className='mt-3 text-sm leading-relaxed text-[var(--text-secondary)]'>
              {result.summary}
            </p>
          ) : null}
          {result.suggestion ? (
            <div className='mt-3 rounded-lg border-l-2 border-[var(--accent-cta)] bg-[var(--bg-app)] px-3 py-2'>
              <div className='text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]'>
                Try this
              </div>
              <p className='mt-0.5 text-sm leading-relaxed text-[var(--text-primary)]'>
                {result.suggestion}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
