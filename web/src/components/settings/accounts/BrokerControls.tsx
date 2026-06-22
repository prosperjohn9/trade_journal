'use client';

import { useEffect, useState } from 'react';
import { mutate } from 'swr';
import { supabase } from '@/src/lib/supabase/client';
import { apiPost } from '@/src/lib/api/fetcher';
import { MetaTraderConnect } from './MetaTraderConnect';
import { TF_VALUES, tfLabel, type Tf } from '@/src/lib/analytics/timeframes';

// An account is linked to exactly one broker. cTrader accounts are auto-imported
// (no connect form), so they get their own identity + Foresight control here;
// everything else falls through to the MetaTrader connect/sync flow.

type CtraderConn = {
  id: string;
  label: string | null;
  environment: string | null;
  guard_enabled: boolean;
  guard_analyzed_tf: string | null;
  guard_executed_tf: string | null;
  guard_setup_id: string | null;
  last_synced_at: string | null;
};

const CONN_COLS =
  'id, label, environment, guard_enabled, guard_analyzed_tf, guard_executed_tf, guard_setup_id, last_synced_at';

export function BrokerControls({
  accountId,
  onChanged,
}: {
  accountId: string;
  onChanged?: () => void;
}) {
  const [ctrader, setCtrader] = useState<CtraderConn | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('ctrader_connections')
      .select(CONN_COLS)
      .eq('account_id', accountId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCtrader((data as CtraderConn | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  // Until we know, render nothing (avoids flashing "Connect MetaTrader" on a
  // cTrader account).
  if (ctrader === undefined) return null;
  if (ctrader) {
    return <CtraderForesight conn={ctrader} onChanged={onChanged} />;
  }
  return <MetaTraderConnect accountId={accountId} onSynced={onChanged} />;
}

const inputSelect =
  'rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none';

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function CtraderForesight({
  conn,
  onChanged,
}: {
  conn: CtraderConn;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CtraderConn>(conn);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [gAnalyzed, setGAnalyzed] = useState<Tf | ''>('');
  const [gExecuted, setGExecuted] = useState<Tf | ''>('');
  const [gSetup, setGSetup] = useState('');
  const [setups, setSetups] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('setup_templates')
      .select('id, name')
      .then(({ data }) => {
        if (!cancelled) setSetups((data ?? []) as { id: string; name: string }[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setGAnalyzed((state.guard_analyzed_tf as Tf) || '');
      setGExecuted((state.guard_executed_tf as Tf) || '');
      setGSetup(state.guard_setup_id || '');
    });
    return () => window.cancelAnimationFrame(id);
  }, [state]);

  async function refresh(): Promise<void> {
    const { data } = await supabase
      .from('ctrader_connections')
      .select(CONN_COLS)
      .eq('id', conn.id)
      .maybeSingle();
    if (data) setState(data as CtraderConn);
  }

  async function toggleGuard(enabled: boolean): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost('/api/guard/ctrader/toggle', { connectionId: conn.id, enabled });
      await refresh();
      setMsg(
        enabled
          ? 'Foresight on. It watches this account and reads every trade you open, free.'
          : 'Foresight turned off for this account.',
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not update Foresight.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost('/api/guard/ctrader/settings', {
        connectionId: conn.id,
        analyzedTf: gAnalyzed || null,
        executedTf: gExecuted || null,
        setupId: gSetup || null,
      });
      await refresh();
      setMsg('Saved. These apply to your next trade on this account.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost('/api/integrations/ctrader/sync', {});
      onChanged?.();
      await mutate(() => true);
      setMsg('Synced your cTrader trades.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span className='text-[var(--text-muted)]'>•</span>
      <button
        className='text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'
        onClick={() => {
          setMsg(null);
          setOpen(true);
        }}>
        cTrader ✓
      </button>

      {open ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
          onClick={() => !busy && setOpen(false)}>
          <div
            className='w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)] shadow-xl'
            onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between'>
              <h3 className='text-base font-semibold'>cTrader Foresight</h3>
              <button
                className='text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                onClick={() => !busy && setOpen(false)}
                aria-label='Close'>
                ✕
              </button>
            </div>

            <div className='mt-4 space-y-3 text-sm'>
              <p className='text-[var(--text-secondary)]'>
                {state.label ? (
                  <strong className='text-[var(--text-primary)]'>
                    {state.label}
                  </strong>
                ) : (
                  'cTrader account'
                )}{' '}
                ({state.environment === 'live' ? 'live' : 'demo'}). Trades last
                synced {relativeTime(state.last_synced_at)}.
              </p>

              <label className='flex items-center justify-between gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2'>
                <span>
                  <span className='font-medium text-[var(--text-primary)]'>
                    Real-time Foresight
                  </span>
                  <span className='mt-0.5 block text-[11px] text-[var(--text-muted)]'>
                    Watch this account and read every trade you open, the instant
                    you open it. Free on cTrader.
                  </span>
                </span>
                <input
                  type='checkbox'
                  className='h-4 w-4 shrink-0'
                  checked={!!state.guard_enabled}
                  onChange={(e) => void toggleGuard(e.target.checked)}
                  disabled={busy}
                />
              </label>

              {state.guard_enabled ? (
                <div className='space-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
                  <p className='text-[11px] text-[var(--text-muted)]'>
                    How you trade this account, so Foresight reads your timeframes
                    instead of the 1H/4H default.
                  </p>
                  <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                    <label className='flex items-center gap-1.5 text-xs text-[var(--text-muted)]'>
                      Analyze
                      <select
                        value={gAnalyzed}
                        onChange={(e) => setGAnalyzed(e.target.value as Tf | '')}
                        className={inputSelect}>
                        <option value=''>Default (1H + 4H)</option>
                        {TF_VALUES.map((t) => (
                          <option key={t} value={t}>
                            {tfLabel(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className='flex items-center gap-1.5 text-xs text-[var(--text-muted)]'>
                      Execute
                      <select
                        value={gExecuted}
                        onChange={(e) => setGExecuted(e.target.value as Tf | '')}
                        className={inputSelect}>
                        <option value=''>Not set</option>
                        {TF_VALUES.map((t) => (
                          <option key={t} value={t}>
                            {tfLabel(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {setups.length > 0 ? (
                      <label className='flex items-center gap-1.5 text-xs text-[var(--text-muted)]'>
                        Setup
                        <select
                          value={gSetup}
                          onChange={(e) => setGSetup(e.target.value)}
                          className={inputSelect}>
                          <option value=''>No setup</option>
                          {setups.map((su) => (
                            <option key={su.id} value={su.id}>
                              {su.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <button
                    onClick={() => void saveSettings()}
                    disabled={busy}
                    className='rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60'>
                    {busy ? 'Saving…' : 'Save settings'}
                  </button>
                </div>
              ) : null}

              <button
                className='w-full rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
                onClick={() => void syncNow()}
                disabled={busy}>
                {busy ? 'Working…' : 'Sync now'}
              </button>
              <p className='text-[11px] text-[var(--text-muted)]'>
                Pulls any new closed trades from cTrader. Auto-syncs daily on its
                own too.
              </p>
            </div>

            {msg ? (
              <p className='mt-3 rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]'>
                {msg}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export type { CtraderConn };
