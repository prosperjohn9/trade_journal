'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { mutate } from 'swr';
import { supabase } from '@/src/lib/supabase/client';
import { apiPost } from '@/src/lib/api/fetcher';

type MtConnection = {
  id: string;
  state: string;
  last_synced_at: string | null;
  last_error: string | null;
  login: string;
  server: string;
};

type SyncResult = {
  results: Array<{
    connectionId: string;
    imported: number;
    skipped: number;
    error?: string;
  }>;
};

const CONN_COLS = 'id, state, last_synced_at, last_error, login, server';

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
      setMsg(e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setMsg(null);
    setSyncing(true);
    try {
      const res = await apiPost<SyncResult>(
        '/api/integrations/metatrader/sync',
        { connectionId: conn?.id },
      );
      const r = res.results[0];
      if (r?.error) {
        setMsg(`Still linking or no trades yet: ${r.error}`);
      } else {
        const imported = r?.imported ?? 0;
        setMsg(
          imported > 0
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
      setMsg(e instanceof Error ? e.message : 'Sync failed.');
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
                <button
                  className='w-full rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
                  onClick={() => void syncNow()}
                  disabled={syncing}>
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
                <p className='text-[11px] text-[var(--text-muted)]'>
                  Pulls any new closed trades from your broker into this account.
                  First sync can take a minute or two after connecting.
                </p>
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
