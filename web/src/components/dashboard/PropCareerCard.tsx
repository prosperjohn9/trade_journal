'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';

// Prop career P&L: the money side broker data never shows. Users log challenge
// fees, payouts, and fee refunds in whatever currency they paid; totals convert
// to a display currency of their choice at daily FX rates. Renders nothing for
// users with no prop accounts and no ledger entries.

type LedgerKind = 'challenge_fee' | 'payout' | 'refund';

type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  amount: number;
  currency: string;
  firm: string | null;
  occurred_at: string;
};

const KIND_LABEL: Record<LedgerKind, string> = {
  challenge_fee: 'Challenge fee',
  payout: 'Payout',
  refund: 'Fee refund',
};

// Currencies prop firms actually bill in, plus the founder's audience locales.
const CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'NGN', 'AUD', 'CAD', 'CHF'];

const ENTRY_CCY_KEY = 'prop-ledger-entry-currency';
const DISPLAY_CCY_KEY = 'prop-ledger-display-currency';
const RATES_CACHE_KEY = 'prop-ledger-fx-usd';
const RATES_TTL_MS = 12 * 60 * 60 * 1000;

/** USD-based rates: rates['EUR'] = how many EUR per 1 USD. */
type Rates = Record<string, number>;

async function loadRates(): Promise<Rates | null> {
  try {
    const cached = window.localStorage.getItem(RATES_CACHE_KEY);
    if (cached) {
      const { at, rates } = JSON.parse(cached) as { at: number; rates: Rates };
      if (Date.now() - at < RATES_TTL_MS && rates?.USD === 1) return rates;
    }
  } catch {
    // re-fetch below
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const body = (await res.json()) as {
      result?: string;
      rates?: Rates;
    };
    if (body.result !== 'success' || !body.rates) return null;
    window.localStorage.setItem(
      RATES_CACHE_KEY,
      JSON.stringify({ at: Date.now(), rates: body.rates }),
    );
    return body.rates;
  } catch {
    return null;
  }
}

function fmt(n: number, currency: string, signed = false): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      signDisplay: signed ? 'exceptZero' : 'auto',
    }).format(n);
  } catch {
    return `${signed && n > 0 ? '+' : ''}${n.toFixed(0)} ${currency}`;
  }
}

function signedAmount(e: LedgerEntry): number {
  return e.kind === 'challenge_fee' ? -Number(e.amount) : Number(e.amount);
}

function readStored(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(key);
  return v && CURRENCIES.includes(v) ? v : fallback;
}

export function PropCareerCard() {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [relevant, setRelevant] = useState(false);
  const [rates, setRates] = useState<Rates | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [kind, setKind] = useState<LedgerKind>('challenge_fee');
  const [amount, setAmount] = useState('');
  const [entryCcy, setEntryCcy] = useState(() => readStored(ENTRY_CCY_KEY, 'USD'));
  const [displayCcy, setDisplayCcy] = useState(() =>
    readStored(DISPLAY_CCY_KEY, 'USD'),
  );
  const [firm, setFirm] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: ledger }, { data: accounts }] = await Promise.all([
        supabase
          .from('prop_ledger')
          .select('id, kind, amount, currency, firm, occurred_at')
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

  // FX rates are only needed once entries exist (and to convert future ones).
  useEffect(() => {
    if (!entries?.length) return;
    let cancelled = false;
    void loadRates().then((r) => {
      if (!cancelled) setRates(r);
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  /** Convert an amount from its currency into the display currency. */
  const convert = useMemo(() => {
    return (value: number, from: string): number | null => {
      if (from === displayCcy) return value;
      if (!rates) return null;
      const rFrom = rates[from];
      const rTo = rates[displayCcy];
      if (!rFrom || !rTo) return null;
      return (value / rFrom) * rTo;
    };
  }, [rates, displayCcy]);

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
          currency: entryCcy,
          firm: firm.trim() || null,
          occurred_at: date,
        })
        .select('id, kind, amount, currency, firm, occurred_at')
        .single();
      if (error) throw error;
      window.localStorage.setItem(ENTRY_CCY_KEY, entryCcy);
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

  // Totals in the display currency. If any entry's rate is unavailable, the
  // totals show a dash rather than a silently wrong number.
  let fees = 0;
  let received = 0;
  let unconverted = false;
  for (const e of entries) {
    const v = convert(Number(e.amount), e.currency);
    if (v == null) {
      unconverted = true;
      continue;
    }
    if (e.kind === 'challenge_fee') fees += v;
    else received += v;
  }
  const net = received - fees;
  const challengeCount = entries.filter((e) => e.kind === 'challenge_fee').length;
  const totalsReady = !unconverted;
  const hasForeign = entries.some((e) => e.currency !== displayCcy);

  const selectClass =
    'rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-2 text-sm text-[var(--text-primary)] outline-none';

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h2 className='text-lg font-semibold'>Prop career</h2>
          <p className='text-xs text-[var(--text-muted)]'>
            Challenge fees vs payouts, across every firm and attempt.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <select
            value={displayCcy}
            onChange={(e) => {
              setDisplayCcy(e.target.value);
              window.localStorage.setItem(DISPLAY_CCY_KEY, e.target.value);
            }}
            aria-label='Totals currency'
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-secondary)] outline-none'>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
      </div>

      {entries.length > 0 ? (
        <>
          <div className='mt-4 grid grid-cols-3 gap-3'>
            <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
              <div className='text-xs text-[var(--text-muted)]'>
                Fees paid ({challengeCount})
              </div>
              <div className='text-xl font-semibold' style={{ color: 'var(--loss)' }}>
                {totalsReady ? fmt(-fees, displayCcy) : '—'}
              </div>
            </div>
            <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
              <div className='text-xs text-[var(--text-muted)]'>
                Payouts + refunds
              </div>
              <div className='text-xl font-semibold' style={{ color: 'var(--profit)' }}>
                {totalsReady ? fmt(received, displayCcy, true) : '—'}
              </div>
            </div>
            <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
              <div className='text-xs text-[var(--text-muted)]'>Net prop ROI</div>
              <div
                className='text-xl font-semibold'
                style={{
                  color: !totalsReady
                    ? 'var(--text-primary)'
                    : net > 0
                      ? 'var(--profit)'
                      : net < 0
                        ? 'var(--loss)'
                        : 'var(--text-primary)',
                }}>
                {totalsReady ? fmt(net, displayCcy, true) : '—'}
              </div>
            </div>
          </div>
          {hasForeign && totalsReady ? (
            <p className='mt-1.5 text-[11px] text-[var(--text-muted)]'>
              Mixed currencies converted to {displayCcy} at today&apos;s rates.
            </p>
          ) : null}
          {!totalsReady ? (
            <p className='mt-1.5 text-[11px] text-[var(--text-muted)]'>
              Loading exchange rates for the totals…
            </p>
          ) : null}
        </>
      ) : (
        <p className='mt-3 text-sm text-[var(--text-secondary)]'>
          Log your challenge fees and payouts to see your real prop ROI, the
          number no broker statement shows you.
        </p>
      )}

      {showForm ? (
        <form
          onSubmit={addEntry}
          className='mt-4 grid grid-cols-2 gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3 sm:grid-cols-6'>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LedgerKind)}
            aria-label='Entry type'
            className={selectClass}>
            <option value='challenge_fee'>Challenge fee</option>
            <option value='payout'>Payout</option>
            <option value='refund'>Fee refund</option>
          </select>
          <div className='flex gap-1'>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder='Amount'
              aria-label='Amount'
              inputMode='decimal'
              className={`${selectClass} min-w-0 flex-1`}
              required
            />
            <select
              value={entryCcy}
              onChange={(e) => setEntryCcy(e.target.value)}
              aria-label='Currency'
              className={selectClass}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <input
            value={firm}
            onChange={(e) => setFirm(e.target.value)}
            placeholder='Firm (e.g. FundingPips)'
            aria-label='Prop firm name'
            className={selectClass}
          />
          <input
            type='date'
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label='Date'
            className={selectClass}
          />
          <button
            type='submit'
            disabled={busy}
            className='rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60 sm:col-span-2'>
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
                  {fmt(signedAmount(e), e.currency, true)}
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
