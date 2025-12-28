'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';

type Trade = {
  id: string;
  opened_at: string;
  instrument: string;
  direction: 'BUY' | 'SELL';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnl_amount: number;
  pnl_percent: number;
  risk_amount: number | null;
  r_multiple: number | null;
  setup: string | null;
  notes: string | null;
};

export default function ViewTradePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [trade, setTrade] = useState<Trade | null>(null);
  const [msg, setMsg] = useState('Loading...');

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return router.push('/auth');

      const { data, error } = await supabase
        .from('trades')
        .select(
          'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, risk_amount, r_multiple, setup, notes'
        )
        .eq('id', id)
        .single();

      if (error || !data) {
        setMsg(error?.message ?? 'Trade not found');
        return;
      }

      setTrade(data as Trade);
      setMsg('');
    })();
  }, [id, router]);

  if (!trade) {
    return (
      <main className='p-6'>
        <p className='opacity-80'>{msg}</p>
        <button
          className='border rounded-lg px-4 py-2 mt-4'
          onClick={() => router.push('/dashboard')}>
          Back
        </button>
      </main>
    );
  }

  return (
    <main className='p-6 max-w-3xl space-y-6'>
      <header className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Trade Details</h1>
        <div className='flex gap-2'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push(`/trades/${trade.id}/edit`)}>
            Edit
          </button>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </div>
      </header>

      <section className='border rounded-xl p-4 space-y-3'>
        <Row
          label='Date/Time'
          value={new Date(trade.opened_at).toLocaleString()}
        />
        <Row label='Instrument' value={trade.instrument} />
        <Row label='Direction' value={trade.direction} />
        <Row label='Outcome' value={trade.outcome} />
        <Row label='P&L ($)' value={trade.pnl_amount.toFixed(2)} />
        <Row label='P&L (%)' value={`${trade.pnl_percent.toFixed(2)}%`} />
        <Row
          label='Risk ($)'
          value={
            trade.risk_amount === null ? '—' : trade.risk_amount.toFixed(2)
          }
        />
        <Row
          label='R Multiple'
          value={trade.r_multiple === null ? '—' : trade.r_multiple.toFixed(2)}
        />
        <Row label='Setup' value={trade.setup ?? '—'} />
        <Row label='Notes' value={trade.notes ?? '—'} />
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className='grid grid-cols-3 gap-3'>
      <div className='text-sm opacity-70'>{label}</div>
      <div className='col-span-2 font-medium'>{value}</div>
    </div>
  );
}