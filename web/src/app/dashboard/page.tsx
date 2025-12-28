'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Trade = {
  id: string;
  opened_at: string;
  instrument: string;
  direction: 'BUY' | 'SELL';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnl_amount: number;
  pnl_percent: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.push('/auth');
    })();
  }, [router]);

  useEffect(() => {
    (async () => {
      const start = new Date(`${month}-01T00:00:00`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);

      const { data, error } = await supabase
        .from('trades')
        .select(
          'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent'
        )
        .gte('opened_at', start.toISOString())
        .lt('opened_at', end.toISOString())
        .order('opened_at', { ascending: true });

      if (!error && data) setTrades(data as Trade[]);
    })();
  }, [month]);

  const stats = useMemo(() => {
    const total = trades.length;
    const wins = trades.filter((t) => t.outcome === 'WIN').length;
    const losses = trades.filter((t) => t.outcome === 'LOSS').length;
    const be = trades.filter((t) => t.outcome === 'BREAKEVEN').length;

    const pnl$ = trades.reduce((s, t) => s + Number(t.pnl_amount), 0);
    const pnlPct = trades.reduce((s, t) => s + Number(t.pnl_percent), 0);

    const winRate = total ? (wins / total) * 100 : 0;

    return { total, wins, losses, be, pnl$, pnlPct, winRate };
  }, [trades]);

  async function logout() {
    await supabase.auth.signOut();
    router.push('/auth');
  }

  return (
    <main className='p-6 space-y-6'>
      <header className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Dashboard</h1>
        <div className='flex gap-2'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/trades/new')}>
            + Add Trade
          </button>
          <button className='border rounded-lg px-4 py-2' onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <section className='flex items-center gap-3'>
        <label className='text-sm opacity-80'>Month:</label>
        <input
          className='border rounded-lg p-2'
          type='month'
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </section>

      <section className='grid grid-cols-2 md:grid-cols-4 gap-3'>
        <Card title='Trades' value={stats.total} />
        <Card title='Win Rate' value={`${stats.winRate.toFixed(1)}%`} />
        <Card title='P&L ($)' value={stats.pnl$.toFixed(2)} />
        <Card title='P&L (%)' value={`${stats.pnlPct.toFixed(2)}%`} />
        <Card title='Wins' value={stats.wins} />
        <Card title='Losses' value={stats.losses} />
        <Card title='Breakeven' value={stats.be} />
      </section>

      <section className='border rounded-xl p-4'>
        <h2 className='font-semibold mb-3'>Trades (this month)</h2>
        <div className='overflow-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-left border-b'>
                <th className='p-2'>Date</th>
                <th className='p-2'>Instrument</th>
                <th className='p-2'>Dir</th>
                <th className='p-2'>Outcome</th>
                <th className='p-2'>P&L ($)</th>
                <th className='p-2'>P&L (%)</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className='border-b'>
                  <td className='p-2'>
                    {new Date(t.opened_at).toLocaleString()}
                  </td>
                  <td className='p-2'>{t.instrument}</td>
                  <td className='p-2'>{t.direction}</td>
                  <td className='p-2'>{t.outcome}</td>
                  <td className='p-2'>{Number(t.pnl_amount).toFixed(2)}</td>
                  <td className='p-2'>{Number(t.pnl_percent).toFixed(2)}%</td>
                </tr>
              ))}
              {!trades.length && (
                <tr>
                  <td className='p-2 opacity-70' colSpan={6}>
                    No trades for this month yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Card({ title, value }: { title: string; value: any }) {
  return (
    <div className='border rounded-xl p-4'>
      <div className='text-sm opacity-70'>{title}</div>
      <div className='text-xl font-semibold'>{value}</div>
    </div>
  );
}