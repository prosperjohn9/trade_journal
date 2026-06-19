'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { mutate } from 'swr';
import { supabase } from '@/src/lib/supabase/client';
import { apiPost, isUpgradeError } from '@/src/lib/api/fetcher';
import { UpgradePrompt } from '@/src/components/ui/UpgradePrompt';
import { TF_VALUES, tfLabel, type Tf } from '@/src/lib/analytics/timeframes';

type MtConnection = {
  id: string;
  state: string;
  last_synced_at: string | null;
  last_error: string | null;
  login: string;
  server: string;
  guard_enabled: boolean;
  guard_analyzed_tf: string | null;
  guard_executed_tf: string | null;
  guard_setup_id: string | null;
};

type SyncResult = {
  results: Array<{
    connectionId: string;
    imported: number;
    skipped: number;
    breached?: boolean;
    error?: string;
  }>;
};

const CONN_COLS =
  'id, state, last_synced_at, last_error, login, server, guard_enabled, guard_analyzed_tf, guard_executed_tf, guard_setup_id';

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

const inputClass =
  'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className='block'>
      <span className='mb-1 block text-xs font-medium text-[var(--text-muted)]'>
        {label}
      </span>
      {children}
    </label>
  );
}

/** Per-account MetaTrader auto-sync: a trigger in the account card's action row
 *  that opens a modal to connect (investor password) or sync trades. */
export function MetaTraderConnect({
  accountId,
  onSynced,
}: {
  accountId: string;
  onSynced?: () => void;
}) {
  const [conn, setConn] = useState<MtConnection | null>(null);
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState('');
  const [server, setServer] = useState('');
  const [password, setPassword] = useState('');
  const [platform, setPlatform] = useState<'mt5' | 'mt4'>('mt5');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);

  // Per-account Foresight read context (analysis/execution timeframe + setup),
  // so the worker's auto-fired read uses the trader's real timeframes.
  const [gAnalyzed, setGAnalyzed] = useState<Tf | ''>('');
  const [gExecuted, setGExecuted] = useState<Tf | ''>('');
  const [gSetup, setGSetup] = useState('');
  const [setups, setSetups] = useState<{ id: string; name: string }[]>([]);
  const [savingGuard, setSavingGuard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('mt_connections')
      .select(CONN_COLS)
      .eq('account_id', accountId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setConn((data as MtConnection | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  // Setup templates for the per-account Foresight setup picker.
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

  // Mirror the connection's saved Foresight settings into the form when it
  // loads or refreshes. Deferred out of the effect body (lint: no sync setState).
  useEffect(() => {
    if (!conn) return;
    const id = window.requestAnimationFrame(() => {
      setGAnalyzed((conn.guard_analyzed_tf as Tf) || '');
      setGExecuted((conn.guard_executed_tf as Tf) || '');
      setGSetup(conn.guard_setup_id || '');
    });
    return () => window.cancelAnimationFrame(id);
  }, [conn]);

  async function saveGuardSettings() {
    if (!conn) return;
    setSavingGuard(true);
    setMsg(null);
    setUpgradeMsg(null);
    try {
      await apiPost('/api/guard/settings', {
        connectionId: conn.id,
        analyzedTf: gAnalyzed || null,
        executedTf: gExecuted || null,
        setupId: gSetup || null,
      });
      // Re-read the live trade with the new settings, pushed to Telegram. If
      // there is no open trade, the analyze call just reports that, which is fine.
      try {
        await apiPost('/api/guard/analyze', {
          accountId,
          deliver: true,
          analyzedTf: gAnalyzed || undefined,
          executedTf: gExecuted || undefined,
          setupId: gSetup || undefined,
        });
        setMsg('Saved. A fresh read was sent to your Telegram.');
      } catch {
        setMsg('Saved. These apply to your next trade on this account.');
      }
      await refresh();
    } catch (e) {
      if (isUpgradeError(e)) setUpgradeMsg(e.message);
      else setMsg(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setSavingGuard(false);
    }
  }

  async function refresh() {
    const { data } = await supabase
      .from('mt_connections')
      .select(CONN_COLS)
      .eq('account_id', accountId)
      .maybeSingle();
    setConn((data as MtConnection | null) ?? null);
  }

  async function connect() {
    setMsg(null);
    setUpgradeMsg(null);
    if (!login.trim() || !server.trim() || !password) {
      setMsg('Login, server and investor password are all required.');
      return;
    }
    setBusy(true);
    try {
      await apiPost('/api/integrations/metatrader/connect', {
        account_id: accountId,
        login: login.trim(),
        server: server.trim(),
        password,
        platform,
      });
      setPassword('');
      await refresh();
      setMsg(
        'Connected. Your account is linking to the broker — give it a minute, then tap "Sync now".',
      );
    } catch (e) {
      if (isUpgradeError(e)) setUpgradeMsg(e.message);
      else setMsg(e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setMsg(null);
    setUpgradeMsg(null);
    setSyncing(true);
    try {
      const res = await apiPost<SyncResult>(
        '/api/integrations/metatrader/sync',
        { connectionId: conn?.id },
      );
      const r = res.results[0];
      if (r?.error) {
        setMsg(r.error);
      } else {
        const imported = r?.imported ?? 0;
        setMsg(
          r?.breached
            ? `Synced ${imported} new trade${imported === 1 ? '' : 's'}, then auto-disconnected: this account hit its prop drawdown rules. Your trades are kept for review.`
            : imported > 0
              ? `Synced — ${imported} new trade${imported === 1 ? '' : 's'} imported.`
              : 'Up to date — balance and stats refreshed.',
        );
        // Always refresh: the accounts list (trade count / starting balance) and
        // every SWR-backed page (dashboard / analytics / monthly), even when no
        // new trades arrived but the balance changed.
        onSynced?.();
        await mutate(() => true);
      }
      await refresh();
    } catch (e) {
      if (isUpgradeError(e)) setUpgradeMsg(e.message);
      else setMsg(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!conn) return;
    setMsg(null);
    setSyncing(true);
    try {
      await apiPost('/api/integrations/metatrader/disconnect', {
        connectionId: conn.id,
      });
      setConn(null);
      onSynced?.();
      await mutate(() => true);
      setMsg(
        'Disconnected. Auto-sync stopped — your imported trades stay in your journal.',
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not disconnect.');
    } finally {
      setSyncing(false);
    }
  }

  async function toggleGuard(on: boolean) {
    if (!conn) return;
    setMsg(null);
    setUpgradeMsg(null);
    setSyncing(true);
    try {
      // Enabling is gated server-side on paid Foresight seats; the route returns
      // a seat-required upgrade error when the user has none free.
      await apiPost('/api/guard/toggle', { connectionId: conn.id, on });
      await refresh();
      setMsg(
        on
          ? 'Real-time Foresight enabled. It starts watching once the worker is live.'
          : 'Real-time Foresight turned off for this account.',
      );
    } catch (e) {
      if (isUpgradeError(e)) setUpgradeMsg(e.message);
      else setMsg(e instanceof Error ? e.message : 'Could not update Foresight.');
    } finally {
      setSyncing(false);
    }
  }

  const closeIfIdle = () => {
    if (!busy && !syncing) setOpen(false);
  };

  return (
    <>
      <span className='text-[var(--text-muted)]'>•</span>
      <button
        className='text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'
        onClick={() => {
          setMsg(null);
          setUpgradeMsg(null);
          setOpen(true);
        }}>
        {conn ? 'MetaTrader ✓' : 'Connect MetaTrader'}
      </button>

      {open ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
          onClick={closeIfIdle}>
          <div
            className='w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)] shadow-xl'
            onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between'>
              <h3 className='text-base font-semibold'>MetaTrader auto-sync</h3>
              <button
                className='text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                onClick={closeIfIdle}
                aria-label='Close'>
                ✕
              </button>
            </div>

            {conn ? (
              <div className='mt-4 space-y-3 text-sm'>
                <p className='text-[var(--text-secondary)]'>
                  Linked to{' '}
                  <strong className='text-[var(--text-primary)]'>
                    {conn.server}
                  </strong>{' '}
                  (login {conn.login}). Last synced{' '}
                  {relativeTime(conn.last_synced_at)}.
                </p>

                <label className='flex items-center justify-between gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2'>
                  <span>
                    <span className='font-medium text-[var(--text-primary)]'>
                      Real-time Foresight
                    </span>
                    <span className='mt-0.5 block text-[11px] text-[var(--text-muted)]'>
                      Watch this account 24/7 and alert you the instant you open
                      a trade. Keeps the account live (the $18 guardrail).
                    </span>
                  </span>
                  <input
                    type='checkbox'
                    className='h-4 w-4 shrink-0'
                    checked={!!conn.guard_enabled}
                    onChange={(e) => void toggleGuard(e.target.checked)}
                    disabled={syncing}
                  />
                </label>

                {conn.guard_enabled ? (
                  <div className='space-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
                    <p className='text-[11px] text-[var(--text-muted)]'>
                      How you trade this account, so Foresight reads your
                      timeframes instead of the 1H/4H default.
                    </p>
                    <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                      <label className='flex items-center gap-1.5 text-xs text-[var(--text-muted)]'>
                        Analyze
                        <select
                          value={gAnalyzed}
                          onChange={(e) =>
                            setGAnalyzed(e.target.value as Tf | '')
                          }
                          className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none'>
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
                          onChange={(e) =>
                            setGExecuted(e.target.value as Tf | '')
                          }
                          className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none'>
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
                            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none'>
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
                    <button
                      onClick={() => void saveGuardSettings()}
                      disabled={savingGuard}
                      className='rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60'>
                      {savingGuard ? 'Saving…' : 'Save & re-read'}
                    </button>
                  </div>
                ) : null}

                {conn.state === 'breached' ? (
                  <p className='rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2 text-xs text-[var(--text-secondary)]'>
                    <span className='font-semibold text-[var(--text-primary)]'>
                      Auto-sync stopped:
                    </span>{' '}
                    this account hit its prop drawdown rules, so it was
                    disconnected to stop sync charges. All trades are kept. If
                    the configured rules were wrong, disconnect below and
                    reconnect to start fresh.
                  </p>
                ) : conn.state === 'over_limit' ? (
                  <p className='rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2 text-xs text-[var(--text-secondary)]'>
                    <span className='font-semibold text-[var(--text-primary)]'>
                      Auto-sync paused:
                    </span>{' '}
                    this account is over your plan&apos;s synced-account limit, so
                    it was disconnected to stop sync charges. An extra-sync add-on
                    lapsed or your plan changed. Renew the add-on (or disconnect
                    another account), then disconnect below and reconnect to
                    resume. All trades are kept.
                  </p>
                ) : (
                  <>
                    <button
                      className='w-full rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
                      onClick={() => void syncNow()}
                      disabled={syncing}>
                      {syncing ? 'Syncing…' : 'Sync now'}
                    </button>
                    <p className='text-[11px] text-[var(--text-muted)]'>
                      Pulls any new closed trades from your broker into this
                      account. First sync can take a minute or two after
                      connecting.
                    </p>
                  </>
                )}
                <button
                  className='w-full rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--loss)] disabled:opacity-60'
                  onClick={() => void disconnect()}
                  disabled={syncing}>
                  Disconnect (keeps imported trades)
                </button>
              </div>
            ) : (
              <div className='mt-4 space-y-3'>
                <p className='text-sm text-[var(--text-secondary)]'>
                  Connect your MT4/MT5 account with its{' '}
                  <strong className='text-[var(--text-primary)]'>
                    investor (read-only) password
                  </strong>{' '}
                  to import trades automatically. We can never place trades or
                  withdraw.
                </p>
                <Field label='Login'>
                  <input
                    className={inputClass}
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder='e.g. 12179330'
                  />
                </Field>
                <Field label='Server'>
                  <input
                    className={inputClass}
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    placeholder='e.g. FundingPips2-SIM'
                  />
                </Field>
                <Field label='Investor password (read-only)'>
                  <input
                    type='password'
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder='Read-only password'
                  />
                </Field>
                <Field label='Platform'>
                  <select
                    className={inputClass}
                    value={platform}
                    onChange={(e) =>
                      setPlatform(e.target.value === 'mt4' ? 'mt4' : 'mt5')
                    }>
                    <option value='mt5'>MetaTrader 5</option>
                    <option value='mt4'>MetaTrader 4</option>
                  </select>
                </Field>
                <button
                  className='w-full rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
                  onClick={() => void connect()}
                  disabled={busy}>
                  {busy ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            )}

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
          </div>
        </div>
      ) : null}
    </>
  );
}
