'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/src/lib/api/fetcher';

// Starts the cTrader OAuth flow. cTrader sync (and Foresight) are free, so this
// is a one-tap connect: fetch the Spotware consent URL and redirect. After the
// user grants access, the callback bounces back with ?ctrader=connected|error,
// which we surface here.

export function ConnectCtraderButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('ctrader');
    if (!status) return;
    const id = window.requestAnimationFrame(() => {
      setMsg(
        status === 'connected'
          ? 'cTrader connected. Your accounts will appear here shortly.'
          : 'cTrader connection failed. Please try connecting again.',
      );
      params.delete('ctrader');
      const qs = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (qs ? `?${qs}` : ''),
      );
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

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
      <button
        onClick={() => void connect()}
        disabled={busy}
        className='rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'>
        {busy ? 'Connecting…' : 'Connect cTrader'}
      </button>
      {msg ? (
        <span className='w-full text-xs text-[var(--text-muted)]'>{msg}</span>
      ) : null}
    </>
  );
}
