'use client';

import { useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';

// Downloads the caller's full trade history as CSV. A plain link can't carry
// the auth header, so we fetch as a blob and trigger the download ourselves.

export function ExportTradesButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setMsg(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in.');

      const res = await fetch('/api/export/trades', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Export failed. Please try again.');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type='button'
        onClick={() => void download()}
        disabled={busy}
        className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'>
        {busy ? 'Preparing…' : 'Download my trades (CSV)'}
      </button>
      {msg ? <p className='mt-2 text-xs text-[var(--loss)]'>{msg}</p> : null}
    </div>
  );
}
