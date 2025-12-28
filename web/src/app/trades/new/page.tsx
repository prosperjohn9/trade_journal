'use client';

import { useMemo, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useRouter } from 'next/navigation';

function nowLocalDatetimeValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());

  // Format required by <input type="datetime-local">
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export default function NewTradePage() {
  const router = useRouter();

  const [openedAt, setOpenedAt] = useState(nowLocalDatetimeValue);

  const [instrument, setInstrument] = useState('EURUSD');
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [outcome, setOutcome] = useState<'WIN' | 'LOSS' | 'BREAKEVEN'>('WIN');

  const [pnlAmount, setPnlAmount] = useState<number>(2000);
  const [pnlPercent, setPnlPercent] = useState<number>(2);

  // Risk and R-multiple
  const [riskAmount, setRiskAmount] = useState<number>(1000);

  const [setup, setSetup] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');

  const rMultiple = useMemo(() => {
    if (!riskAmount || Number.isNaN(riskAmount)) return null;
    if (Number.isNaN(pnlAmount)) return null;
    return pnlAmount / riskAmount;
  }, [pnlAmount, riskAmount]);

  async function saveTrade(e: React.FormEvent) {
    e.preventDefault();
    setMsg('Saving...');

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return router.push('/auth');

    const { error } = await supabase.from('trades').insert({
      user_id: user.id,
      // Store in DB as UTC ISO
      opened_at: new Date(openedAt).toISOString(),
      instrument,
      direction,
      setup: setup || null,
      outcome,
      pnl_amount: pnlAmount,
      pnl_percent: pnlPercent,
      risk_amount: riskAmount || null,
      r_multiple: rMultiple,
      notes: notes || null,
    });

    if (error) return setMsg(error.message);

    setMsg('Saved');
    router.push('/dashboard');
  }

  return (
    <main className='p-6 max-w-2xl space-y-6'>
      <header className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Add Trade</h1>
        <button
          className='border rounded-lg px-4 py-2'
          onClick={() => router.push('/dashboard')}>
          Back
        </button>
      </header>

      <form onSubmit={saveTrade} className='space-y-4 border rounded-xl p-4'>
        <Field label='Date/Time'>
          <input
            className='w-full border rounded-lg p-3'
            type='datetime-local'
            value={openedAt}
            onChange={(e) => setOpenedAt(e.target.value)}
            required
          />
        </Field>

        <Field label='Instrument'>
          <input
            className='w-full border rounded-lg p-3'
            value={instrument}
            onChange={(e) => setInstrument(e.target.value.toUpperCase())}
            required
          />
        </Field>

        <div className='grid grid-cols-2 gap-3'>
          <Field label='Direction'>
            <select
              className='w-full border rounded-lg p-3'
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}>
              <option value='BUY'>BUY</option>
              <option value='SELL'>SELL</option>
            </select>
          </Field>

          <Field label='Outcome'>
            <select
              className='w-full border rounded-lg p-3'
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as any)}>
              <option value='WIN'>WIN</option>
              <option value='LOSS'>LOSS</option>
              <option value='BREAKEVEN'>BREAKEVEN</option>
            </select>
          </Field>
        </div>

        <div className='grid grid-cols-2 gap-3'>
          <Field label='P&L ($)'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={pnlAmount}
              onChange={(e) => setPnlAmount(Number(e.target.value))}
              required
            />
          </Field>

          <Field label='P&L (%)'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={pnlPercent}
              onChange={(e) => setPnlPercent(Number(e.target.value))}
              required
            />
          </Field>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Risk ($) — for R multiple'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={riskAmount}
              onChange={(e) => setRiskAmount(Number(e.target.value))}
            />
          </Field>

          <div className='border rounded-lg p-3 flex items-center'>
            <div className='text-sm opacity-70'>
              R-Multiple:{' '}
              <span className='font-semibold'>
                {rMultiple === null || Number.isNaN(rMultiple)
                  ? '—'
                  : rMultiple.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <Field label='Setup (optional)'>
          <input
            className='w-full border rounded-lg p-3'
            value={setup}
            onChange={(e) => setSetup(e.target.value)}
          />
        </Field>

        <Field label='Notes (optional)'>
          <textarea
            className='w-full border rounded-lg p-3 min-h-28'
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <button className='w-full border rounded-lg p-3'>Save Trade</button>
        {msg && <p className='text-sm opacity-80'>{msg}</p>}
      </form>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className='block space-y-1'>
      <div className='text-sm opacity-70'>{label}</div>
      {children}
    </label>
  );
}