'use client';

import { useEffect, useState } from 'react';
import { mutate } from 'swr';
import { supabase } from '@/src/lib/supabase/client';

type BalanceEvent = {
  id: string;
  kind: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  occurred_at: string;
  source: string;
  note: string | null;
};

const inputClass =
  'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function fmtAmount(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

/** Per-account deposits/withdrawals ledger: view broker + manual cash flows and
 *  add manual ones. Synced (source 'metaapi') entries are read-only. */
export function BalanceEventsButton({
  accountId,
  onChanged,
}: {
  accountId: string;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<BalanceEvent[]>([]);
  const [kind, setKind] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from('account_balance_events')
      .select('id, kind, amount, occurred_at, source, note')
      .eq('account_id', accountId)
      .order('occurred_at', { ascending: false });
    setEvents((data as BalanceEvent[] | null) ?? []);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase
      .from('account_balance_events')
      .select('id, kind, amount, occurred_at, source, note')
      .eq('account_id', accountId)
      .order('occurred_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setEvents((data as BalanceEvent[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

  async function add() {
    setMsg(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg('Enter a positive amount.');
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const occurred_at = date
        ? new Date(date).toISOString()
        : new Date().toISOString();
      const { error } = await supabase.from('account_balance_events').insert({
        user_id: user.id,
        account_id: accountId,
        kind,
        amount: amt,
        occurred_at,
        source: 'manual',
      });
      if (error) throw error;
      setAmount('');
      setDate('');
      await load();
      onChanged?.();
      await mutate(() => true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not add.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await supabase.from('account_balance_events').delete().eq('id', id);
      await load();
      onChanged?.();
      await mutate(() => true);
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
        Deposits
      </button>

      {open ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
          onClick={() => !busy && setOpen(false)}>
          <div
            className='flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xl'
            onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between border-b border-[var(--border-default)] px-5 py-3'>
              <h3 className='text-base font-semibold'>Deposits &amp; withdrawals</h3>
              <button
                className='text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                onClick={() => !busy && setOpen(false)}
                aria-label='Close'>
                ✕
              </button>
            </div>

            <div className='flex-1 overflow-y-auto px-5 py-3'>
              {events.length === 0 ? (
                <p className='py-4 text-center text-sm text-[var(--text-muted)]'>
                  No deposits or withdrawals yet.
                </p>
              ) : (
                <ul className='space-y-2'>
                  {events.map((e) => (
                    <li
                      key={e.id}
                      className='flex items-center justify-between rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm'>
                      <div>
                        <span
                          className={
                            e.kind === 'DEPOSIT'
                              ? 'font-semibold text-[var(--profit)]'
                              : 'font-semibold text-[var(--loss)]'
                          }>
                          {e.kind === 'DEPOSIT' ? '+' : '−'}
                          {fmtAmount(Number(e.amount))}
                        </span>
                        <span className='ml-2 text-xs text-[var(--text-muted)]'>
                          {fmtDate(e.occurred_at)}
                          {e.source === 'metaapi' ? ' · synced' : ''}
                        </span>
                      </div>
                      {e.source !== 'metaapi' ? (
                        <button
                          className='text-xs text-[var(--text-muted)] hover:text-[var(--loss)] disabled:opacity-50'
                          onClick={() => void remove(e.id)}
                          disabled={busy}>
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className='space-y-3 border-t border-[var(--border-default)] px-5 py-3'>
              <div className='flex gap-2'>
                <button
                  className={
                    kind === 'DEPOSIT'
                      ? 'flex-1 rounded-lg bg-[var(--accent-cta)] px-3 py-1.5 text-xs font-semibold text-white'
                      : 'flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-secondary)]'
                  }
                  onClick={() => setKind('DEPOSIT')}>
                  Deposit
                </button>
                <button
                  className={
                    kind === 'WITHDRAWAL'
                      ? 'flex-1 rounded-lg bg-[var(--accent-cta)] px-3 py-1.5 text-xs font-semibold text-white'
                      : 'flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-secondary)]'
                  }
                  onClick={() => setKind('WITHDRAWAL')}>
                  Withdrawal
                </button>
              </div>
              <div className='flex gap-2'>
                <input
                  className={inputClass}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode='decimal'
                  placeholder='Amount'
                />
                <input
                  className={inputClass}
                  type='date'
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <button
                className='w-full rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
                onClick={() => void add()}
                disabled={busy}>
                {busy ? 'Saving…' : `Add ${kind === 'DEPOSIT' ? 'deposit' : 'withdrawal'}`}
              </button>
              {msg ? (
                <p className='rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]'>
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
