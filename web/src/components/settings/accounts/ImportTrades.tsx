'use client';

import { useRef, useState } from 'react';
import { mutate } from 'swr';
import { supabase } from '@/src/lib/supabase/client';

// Statement import for any platform we don't auto-sync: MT5 HTML report, or
// CSV/XLSX exports from cTrader, TradeLocker, DXtrade, MatchTrader, and
// friends. Free on every plan; re-uploading the same file never duplicates.

type ImportResult = {
  imported: number;
  duplicates: number;
  skippedRows: number;
};

export function ImportTrades({
  accountId,
  onImported,
}: {
  accountId: string;
  onImported?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    setOk(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in.');

      const form = new FormData();
      form.append('file', file);
      form.append('accountId', accountId);

      const res = await fetch('/api/imports/file', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as Partial<ImportResult> & {
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || 'Import failed.');

      const r = body as ImportResult;
      setOk(true);
      setMsg(
        r.imported > 0
          ? `Imported ${r.imported} trade${r.imported === 1 ? '' : 's'}` +
              (r.duplicates ? `, ${r.duplicates} already in your journal.` : '.')
          : 'Everything in that file is already in your journal.',
      );
      onImported?.();
      await mutate(() => true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <span className='text-[var(--text-muted)]'>•</span>
      <button
        className='text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'
        onClick={() => {
          setMsg(null);
          setOk(false);
          setOpen(true);
        }}>
        Import file
      </button>

      {open ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
          onClick={() => !busy && setOpen(false)}>
          <div
            className='w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)] shadow-xl'
            onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between'>
              <h3 className='text-base font-semibold'>Import trades from a file</h3>
              <button
                className='text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                onClick={() => !busy && setOpen(false)}
                aria-label='Close'>
                ✕
              </button>
            </div>

            <div className='mt-4 space-y-3 text-sm'>
              <p className='text-[var(--text-secondary)]'>
                Upload a trade history export and we will import every closed
                trade into this account. Duplicates are detected automatically,
                so re-uploading is always safe.
              </p>

              <ul className='space-y-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3 text-xs text-[var(--text-secondary)]'>
                <li>
                  <strong className='text-[var(--text-primary)]'>
                    MetaTrader 5:
                  </strong>{' '}
                  Toolbox, History tab, right-click, Report (HTML). Desktop
                  terminal only.
                </li>
                <li>
                  <strong className='text-[var(--text-primary)]'>
                    cTrader, TradeLocker, DXtrade, MatchTrader:
                  </strong>{' '}
                  export your trade history as CSV or Excel from the platform
                  or your broker portal.
                </li>
                <li>
                  Any CSV/XLSX works if it has columns for symbol, profit, and
                  an open or close time.
                </li>
              </ul>

              <input
                ref={fileRef}
                type='file'
                accept='.csv,.txt,.html,.htm,.xlsx,.xls'
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
                className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3 text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent-cta)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white disabled:opacity-60'
              />

              {busy ? (
                <p className='text-xs text-[var(--text-muted)]'>Importing…</p>
              ) : null}
              {msg ? (
                <p
                  className={`rounded-lg px-3 py-2 text-xs ${
                    ok
                      ? 'bg-[var(--surface-muted)] text-[var(--text-secondary)]'
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                  {msg}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
