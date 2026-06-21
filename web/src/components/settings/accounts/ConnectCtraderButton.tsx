'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiPost } from '@/src/lib/api/fetcher';

// cTrader connect + sync. Connect runs the OAuth flow; Sync pulls deal history
// over the Open API socket into trades. After authorizing, the callback bounces
// back with ?ctrader=connected, which we use to auto-sync once.

type SyncResult = {
  connected: boolean;
  accounts?: Array<{ login: number; imported: number; total: number }>;
};

const btn =
  'rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60';

export function ConnectCtraderButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sync = useCallback(async (announce = true) => {
    setBusy(true);
    if (announce) setMsg('Syncing your cTrader trades...');
    try {
      const r = await apiPost<SyncResult>(
        '/api/integrations/ctrader/sync',
        {},
      );
      if (!r.connected) {
        setMsg('Connect cTrader first.');
        setBusy(false);
        return;
      }
      const imported = (r.accounts ?? []).reduce((s, a) => s + a.imported, 0);
      const n = (r.accounts ?? []).length;
      setMsg(
        `Synced ${imported} trade${imported === 1 ? '' : 's'} across ${n} cTrader account${n === 1 ? '' : 's'}.`,
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'cTrader sync failed.');
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('ctrader');
    if (!status) return;
    const id = window.requestAnimationFrame(() => {
      params.delete('ctrader');
      const qs = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (qs ? `?${qs}` : ''),
      );
      if (status === 'connected') void sync();
      else setMsg('cTrader connection failed. Please try connecting again.');
    });
    return () => window.cancelAnimationFrame(id);
  }, [sync]);

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      const { url } = await apiFetch<{ url: string }>(
        '/api/integrations/ctrader/connect',
      );
      window.location.href = url;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not start cTrader connect.');
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => void connect()} disabled={busy} className={btn}>
        Connect cTrader
      </button>
      <button onClick={() => void sync()} disabled={busy} className={btn}>
        {busy ? 'Working…' : 'Sync cTrader'}
      </button>
      <span className='w-full text-xs text-[var(--text-muted)]'>
        {msg ??
          'cTrader imports your accounts, balance, and trade history automatically (read-only). Edit an account if anything looks off.'}
      </span>
    </>
  );
}
