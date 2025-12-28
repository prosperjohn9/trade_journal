'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabaseClient';
import { getOrCreateProfile, type Profile } from '@/src/lib/profile';
import {
  computeReport,
  monthToRange,
  type TradeRow,
} from '@/src/lib/analytics';

function monthInputDefault() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function n(x: any, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

export default function MonthlyReportPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [month, setMonth] = useState(monthInputDefault);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Use the browser timezone for daily grouping (matches what user sees locally)
  const localTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg('');

      try {
        const { profile, user } = await getOrCreateProfile();
        if (!user) return router.push('/auth');
        setProfile(profile);

        const { startIso, endIso } = monthToRange(month);

        const { data, error } = await supabase
          .from('trades')
          .select(
            'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, risk_amount, r_multiple'
          )
          .gte('opened_at', startIso)
          .lt('opened_at', endIso)
          .order('opened_at', { ascending: true });

        if (error) {
          console.error(error);
          setTrades([]);
          setMsg(error.message);
        } else {
          setTrades((data ?? []) as TradeRow[]);
        }
      } catch (e: any) {
        console.error(e);
        setMsg(e?.message ?? 'Failed to load monthly report');
      } finally {
        setLoading(false);
      }
    })();
  }, [month, router]);

  const report = useMemo(() => {
    const startingBalance = n((profile as any)?.starting_balance, 0);
    return computeReport({
      trades,
      startingBalance,
      timeZone: localTz,
    });
  }, [trades, profile, localTz]);

  const baseCurrency = (profile as any)?.base_currency || 'USD';

  return (
    <main className='p-6 space-y-6'>
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Monthly Report</h1>
          <div className='text-sm opacity-80'>
            Daily grouping timezone:{' '}
            <span className='font-semibold'>{report.timeZone}</span>
          </div>
        </div>

        <div className='flex gap-2'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/dashboard')}>
            Back
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

      {loading && <p className='opacity-80'>Loading...</p>}
      {msg && <p className='opacity-80'>{msg}</p>}

      {!loading && (
        <>
          {/* Equity Curve */}
          <section className='border rounded-xl p-4 space-y-3'>
            <div className='flex items-center justify-between gap-4'>
              <h2 className='font-semibold'>Equity Curve</h2>
              <div className='text-sm opacity-70'>
                Start: {report.startingBalance.toFixed(2)} {baseCurrency} • End:{' '}
                {report.endingBalance.toFixed(2)} {baseCurrency}
              </div>
            </div>

            <LineChart
              values={[
                report.startingBalance,
                ...report.daily.map((p) => p.equity),
              ]}
              labels={['Start', ...report.daily.map((p) => p.dateLabel)]}
            />

            <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
              <Card
                title='Total PnL'
                value={`${report.netPnl.toFixed(2)} ${baseCurrency}`}
              />
              <Card title='Trades' value={report.totalTrades} />
              <Card title='Win Rate' value={`${report.winRate.toFixed(1)}%`} />
              <Card
                title='Max DD'
                value={`${report.maxDrawdown.toFixed(2)} ${baseCurrency}`}
              />
            </div>
          </section>

          {/* Core Performance */}
          <section className='grid grid-cols-2 md:grid-cols-4 gap-3'>
            <Card title='Average Profit' value={report.avgWin.toFixed(2)} />
            <Card title='Average Loss' value={report.avgLoss.toFixed(2)} />
            <Card
              title='RRR (AvgWin/|AvgLoss|)'
              value={report.rrr.toFixed(2)}
            />
            <Card
              title='Expectancy / trade'
              value={report.expectancy.toFixed(2)}
            />
            <Card
              title='Profit Factor'
              value={
                Number.isFinite(report.profitFactor)
                  ? report.profitFactor.toFixed(2)
                  : '∞'
              }
            />
            <Card title='Sharpe Ratio' value={report.sharpe.toFixed(2)} />
            <Card title='Gross Profit' value={report.grossProfit.toFixed(2)} />
            <Card
              title='Gross Loss (abs)'
              value={report.grossLossAbs.toFixed(2)}
            />
          </section>

          {/* Best / Worst Day */}
          <section className='border rounded-xl p-4 space-y-3'>
            <h2 className='font-semibold'>Best / Worst Day</h2>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              <div className='border rounded-xl p-4'>
                <div className='text-sm opacity-70'>Best day</div>
                <div className='text-lg font-semibold'>
                  {report.bestDay ? report.bestDay.dayKey : '—'}
                </div>
                <div className='opacity-80'>
                  {report.bestDay
                    ? `${report.bestDay.pnl.toFixed(2)} ${baseCurrency}`
                    : '—'}
                </div>
              </div>

              <div className='border rounded-xl p-4'>
                <div className='text-sm opacity-70'>Worst day</div>
                <div className='text-lg font-semibold'>
                  {report.worstDay ? report.worstDay.dayKey : '—'}
                </div>
                <div className='opacity-80'>
                  {report.worstDay
                    ? `${report.worstDay.pnl.toFixed(2)} ${baseCurrency}`
                    : '—'}
                </div>
              </div>
            </div>
          </section>

          {/* Best symbols */}
          <section className='border rounded-xl p-4 space-y-3'>
            <h2 className='font-semibold'>Best Performing Symbols</h2>

            <div className='overflow-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-left border-b'>
                    <th className='p-2'>Symbol</th>
                    <th className='p-2'>Trades</th>
                    <th className='p-2'>Win Rate</th>
                    <th className='p-2'>Net P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {report.bySymbol.map((r) => (
                    <tr key={r.symbol} className='border-b'>
                      <td className='p-2 font-semibold'>{r.symbol}</td>
                      <td className='p-2'>{r.count}</td>
                      <td className='p-2'>{r.winRate.toFixed(1)}%</td>
                      <td className='p-2'>{r.pnl.toFixed(2)}</td>
                    </tr>
                  ))}

                  {!report.bySymbol.length && (
                    <tr>
                      <td className='p-2 opacity-70' colSpan={4}>
                        No trades for this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Daily table (useful for verifying numbers) */}
          <section className='border rounded-xl p-4 space-y-3'>
            <h2 className='font-semibold'>Daily Results</h2>
            <div className='overflow-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-left border-b'>
                    <th className='p-2'>Day</th>
                    <th className='p-2'>Daily P&L</th>
                    <th className='p-2'>Equity</th>
                  </tr>
                </thead>
                <tbody>
                  {report.daily.map((d) => (
                    <tr key={d.dayKey} className='border-b'>
                      <td className='p-2'>{d.dayKey}</td>
                      <td className='p-2'>
                        {d.pnl.toFixed(2)} {baseCurrency}
                      </td>
                      <td className='p-2'>
                        {d.equity.toFixed(2)} {baseCurrency}
                      </td>
                    </tr>
                  ))}
                  {!report.daily.length && (
                    <tr>
                      <td className='p-2 opacity-70' colSpan={3}>
                        No daily data yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
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

/**
 * Minimal SVG line chart (no libs)
 */
function LineChart({ values, labels }: { values: number[]; labels: string[] }) {
  const width = 900;
  const height = 220;
  const pad = 16;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = pad + (i * (width - pad * 2)) / Math.max(values.length - 1, 1);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return { x, y, v, label: labels[i] ?? '' };
  });

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  return (
    <div className='w-full overflow-x-auto'>
      <svg width={width} height={height} className='block'>
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke='currentColor'
          opacity='0.15'
        />
        <path d={d} fill='none' stroke='currentColor' strokeWidth='2' />

        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r='4'
            fill='currentColor'
          />
        )}
      </svg>

      <div className='flex justify-between text-xs opacity-60 mt-2'>
        <span>{labels[0] ?? ''}</span>
        <span>{labels[labels.length - 1] ?? ''}</span>
      </div>
    </div>
  );
}