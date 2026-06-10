'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';

// Prop career P&L: the money side broker data never shows. Users log challenge
// fees, payouts, and fee refunds; the card answers "across every prop attempt,
// am I actually up?". Renders nothing for users with no prop accounts and no
// ledger entries. Amounts are USD (the prop industry's billing currency).

type LedgerKind = 'challenge_fee' | 'payout' | 'refund';

type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  amount: number;
  firm: string | null;
  occurred_at: string;
};

const KIND_LABEL: Record<LedgerKind, string> = {
  challenge_fee: 'Challenge fee',
  payout: 'Payout',
  refund: 'Fee refund',
};

function usd(n: number, signed = false): string {
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function signedAmount(e: LedgerEntry): number {
  return e.kind === 'challenge_fee' ? -Number(e.amount) : Number(e.amount);
}

export function PropCareerCard() {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [relevant, setRelevant] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [kind, setKind] = useState<LedgerKind>('challenge_fee');
  const [amount, setAmount] = useState('');
  const [firm, setFirm] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: ledger }, { data: accounts }] = await Promise.all([
        supabase
          .from('prop_ledger')
          .select('id, kind, amount, firm, occurred_at')
          .order('occurred_at', { ascending: false }),
        supabase.from('accounts').select('account_type'),
      ]);
      if (cancelled) return;
      const rows = (ledger ?? []) as LedgerEntry[];
      const hasProp = ((accounts ?? []) as { account_type: string }[]).some(
        (a) =>
          a.account_type === 'Prop Challenge' ||
          a.account_type === 'Prop Funded',
      );
      setEntries(rows);
      setRelevant(hasProp || rows.length > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMsg('Enter an amount greater than 0.');
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const { data, error } = await supabase
        .from('prop_ledger')
        .insert({
          user_id: user.id,
          kind,
          amount: value,
          firm: firm.trim() || null,
          occurred_at: date,
        })
        .select('id, kind, amount, firm, occurred_at')
        .single();
      if (error) throw error;
      setEntries((prev) => {
        const next = [...(prev ?? []), data as LedgerEntry];
        next.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
        return next;
      });
      setRelevant(true);
      setAmount('');
      setFirm('');
      setShowForm(false);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save the entry.');
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(id: string) {
    const prev = entries;
    setEntries((cur) => (cur ?? []).filter((e) => e.id !== id));
    const { error } = await supabase.from('prop_ledger').delete().eq('id', id);
    if (error) {
      setEntries(prev); // restore on failure
      setMsg('Could not delete the entry.');
    }
  }

  if (!entries || !relevant) return null;

  const fees = entries
    .filter((e) => e.kind === 'challenge_fee')
    .reduce((s, e) => s + Number(e.amount), 0);
  const received = entries
    .filter((e) => e.kind !== 'challenge_fee')
    .reduce((s, e) => s + Number(e.amount), 0);
  const net = received - fees;
  const challengeCount = entries.filter((e) => e.kind === 'challenge_fee').length;

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h2 className='text-lg font-semibold'>Prop career</h2>
          <p className='text-xs text-[var(--text-muted)]'>
            Challenge fees vs payouts, across every firm and attempt.
          </p>
        </div>
        <button
          type='button'
          onClick={() => {
            setShowForm((v) => !v);
            setMsg(null);
          }}
          className='rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'>
          {showForm ? 'Close' : 'Add entry'}
        </button>
      </div>

      {entries.length > 0 ? (
        <div className='mt-4 grid grid-cols-3 gap-3'>
          <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div className='text-xs text-[var(--text-muted)]'>
              Fees paid ({challengeCount})
            </div>
            <div className='text-xl font-semibold' style={{ color: 'var(--loss)' }}>
              {usd(-fees)}
            </div>
          </div>
          <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div className='text-xs text-[var(--text-muted)]'>
              Payouts + refunds
            </div>
            <div className='text-xl font-semibold' style={{ color: 'var(--profit)' }}>
              {usd(received, true)}
            </div>
          </div>
          <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div className='text-xs text-[var(--text-muted)]'>Net prop ROI</div>
            <div
              className='text-xl font-semibold'
              style={{
                color:
                  net > 0
                    ? 'var(--profit)'
                    : net < 0
                      ? 'var(--loss)'
                      : 'var(--text-primary)',
              }}>
              {usd(net, true)}
            </div>
          </div>
        </div>
      ) : (
        <p className='mt-3 text-sm text-[var(--text-secondary)]'>
          Log your challenge fees and payouts to see your real prop ROI, the
          number no broker statement shows you.
        </p>
      )}

      {showForm ? (
        <form
          onSubmit={addEntry}
          className='mt-4 grid grid-cols-2 gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3 sm:grid-cols-5'>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LedgerKind)}
            aria-label='Entry type'
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-2 text-sm text-[var(--text-primary)] outline-none'>
            <option value='challenge_fee'>Challenge fee</option>
            <option value='payout'>Payout</option>
            <option value='refund'>Fee refund</option>
          </select>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder='Amount (USD)'
            aria-label='Amount in USD'
            inputMode='decimal'
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-2 text-sm text-[var(--text-primary)] outline-none'
            required
          />
          <input
            value={firm}
            onChange={(e) => setFirm(e.target.value)}
            placeholder='Firm (e.g. FundingPips)'
            aria-label='Prop firm name'
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-2 text-sm text-[var(--text-primary)] outline-none'
          />
          <input
            type='date'
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label='Date'
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-2 text-sm text-[var(--text-primary)] outline-none'
          />
          <button
            type='submit'
            disabled={busy}
            className='rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : null}

      {msg ? <p className='mt-2 text-xs text-[var(--loss)]'>{msg}</p> : null}

      {entries.length > 0 ? (
        <ul className='mt-3 divide-y divide-[var(--border-default)]'>
          {entries.slice(0, 6).map((e) => (
            <li
              key={e.id}
              className='flex items-center justify-between gap-3 py-1.5 text-sm'>
              <span className='min-w-0 truncate text-[var(--text-secondary)]'>
                <span className='font-medium text-[var(--text-primary)]'>
                  {KIND_LABEL[e.kind]}
                </span>
                {e.firm ? ` · ${e.firm}` : ''} ·{' '}
                {new Date(e.occurred_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <span className='flex shrink-0 items-center gap-2'>
                <span
                  className='font-semibold'
                  style={{
                    color:
                      signedAmount(e) >= 0 ? 'var(--profit)' : 'var(--loss)',
                  }}>
                  {usd(signedAmount(e), true)}
                </span>
                <button
                  type='button'
                  onClick={() => void removeEntry(e.id)}
                  aria-label='Delete entry'
                  className='rounded px-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--loss)]'>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
