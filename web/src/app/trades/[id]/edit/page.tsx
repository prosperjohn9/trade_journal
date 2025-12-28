'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';

type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
type Direction = 'BUY' | 'SELL';

function toDatetimeLocalValue(dateIso: string) {
  const d = new Date(dateIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export default function EditTradePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [openedAt, setOpenedAt] = useState<string>('');
  const [instrument, setInstrument] = useState('EURUSD');
  const [direction, setDirection] = useState<Direction>('BUY');
  const [outcome, setOutcome] = useState<Outcome>('WIN');

  // strings for better typing (minus, empty, etc.)
  const [pnlAmount, setPnlAmount] = useState<string>('0');
  const [pnlPercent, setPnlPercent] = useState<string>('0');

  const [riskAmount, setRiskAmount] = useState<number>(1000);
  const [setup, setSetup] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return router.push('/auth');

      const { data, error } = await supabase
        .from('trades')
        .select(
          'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, risk_amount, setup, notes'
        )
        .eq('id', id)
        .single();

      if (error || !data) {
        setMsg(error?.message ?? 'Trade not found');
        setLoading(false);
        return;
      }

      setOpenedAt(toDatetimeLocalValue(data.opened_at));
      setInstrument(data.instrument);
      setDirection(data.direction);
      setOutcome(data.outcome);
      setPnlAmount(String(data.pnl_amount));
      setPnlPercent(String(data.pnl_percent));
      setRiskAmount(data.risk_amount ?? 1000);
      setSetup(data.setup ?? '');
      setNotes(data.notes ?? '');
      setLoading(false);
    })();
  }, [id, router]);

  const rMultiple = useMemo(() => {
    const amountNum = Number(pnlAmount);
    if (!riskAmount || Number.isNaN(riskAmount) || Number.isNaN(amountNum))
      return null;
    return amountNum / riskAmount;
  }, [pnlAmount, riskAmount]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg('Saving...');

    const pnlAmountNum = Number(pnlAmount);
    const pnlPercentNum = Number(pnlPercent);

    if (Number.isNaN(pnlAmountNum) || Number.isNaN(pnlPercentNum)) {
      setMsg('Please enter valid P&L values.');
      return;
    }

    let finalPnlAmount = pnlAmountNum;
    let finalPnlPercent = pnlPercentNum;

    if (outcome === 'LOSS') {
      finalPnlAmount = -Math.abs(pnlAmountNum);
      finalPnlPercent = -Math.abs(pnlPercentNum);
    } else if (outcome === 'WIN') {
      finalPnlAmount = Math.abs(pnlAmountNum);
      finalPnlPercent = Math.abs(pnlPercentNum);
    }

    const finalR =
      riskAmount && !Number.isNaN(riskAmount)
        ? finalPnlAmount / riskAmount
        : null;

    const { error } = await supabase
      .from('trades')
      .update({
        opened_at: new Date(openedAt).toISOString(),
        instrument,
        direction,
        outcome,
        pnl_amount: finalPnlAmount,
        pnl_percent: finalPnlPercent,
        risk_amount: riskAmount || null,
        r_multiple: finalR,
        setup: setup || null,
        notes: notes || null,
      })
      .eq('id', id);

    if (error) return setMsg(error.message);

    setMsg('Saved successfully');
    router.push(`/trades/${id}`);
  }

  if (loading) {
    return (
      <main className='p-6'>
        <p className='opacity-80'>Loading...</p>
      </main>
    );
  }

  return (
    <main className='p-6 max-w-2xl space-y-6'>
      <header className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Edit Trade</h1>
        <button
          className='border rounded-lg px-4 py-2'
          onClick={() => router.push(`/trades/${id}`)}>
          Cancel
        </button>
      </header>

      {msg && <p className='text-sm opacity-80'>{msg}</p>}

      <form onSubmit={save} className='space-y-4 border rounded-xl p-4'>
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
              onChange={(e) => setPnlAmount(e.target.value)}
              required
            />
          </Field>

          <Field label='P&L (%)'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={pnlPercent}
              onChange={(e) => setPnlPercent(e.target.value)}
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

        <button className='w-full border rounded-lg p-3'>Save Changes</button>
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