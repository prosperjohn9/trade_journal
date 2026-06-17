'use client';

import { useEffect, useState } from 'react';
import { apiFetch, apiPost } from '@/src/lib/api/fetcher';

// Link the user's Telegram so Foresight can message them when a guarded account
// opens a trade. They tap Connect, press Start in the bot, the deep-link code
// matches them server-side. No chat id ever typed.

export function ConnectTelegram() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    try {
      const r = await apiFetch<{ linked: boolean; configured: boolean }>(
        '/api/telegram/link',
      );
      setLinked(r.linked);
      setConfigured(r.configured);
    } catch {
      // ignore
    }
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await apiFetch<{ linked: boolean; configured: boolean }>(
          '/api/telegram/link',
        );
        if (!cancelled) {
          setLinked(r.linked);
          setConfigured(r.configured);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      const { url } = await apiPost<{ url: string }>('/api/telegram/link', {});
      window.open(url, '_blank', 'noopener');
      setMsg('Telegram opened. Press Start in the bot, then tap Refresh here.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not start linking.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <h2 className='text-lg font-semibold'>Telegram alerts</h2>
      <p className='mt-1 text-xs text-[var(--text-muted)]'>
        Get the Foresight read on Telegram the instant you open a trade on an
        account you have enabled Foresight for.
      </p>

      {!configured ? (
        <p className='mt-3 text-sm text-[var(--text-muted)]'>
          Telegram is not set up on the server yet.
        </p>
      ) : linked ? (
        <p className='mt-3 text-sm font-medium text-[var(--profit)]'>
          Telegram is linked.
        </p>
      ) : (
        <div className='mt-3 flex flex-wrap items-center gap-2'>
          <button
            onClick={() => void connect()}
            disabled={busy}
            className='rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
            {busy ? 'Opening...' : 'Connect Telegram'}
          </button>
          <button
            onClick={() => void refresh()}
            className='rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'>
            Refresh
          </button>
        </div>
      )}
      {msg ? (
        <p className='mt-2 text-xs text-[var(--text-muted)]'>{msg}</p>
      ) : null}
    </section>
  );
}
