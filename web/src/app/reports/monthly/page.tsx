'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabaseClient';
import { getOrCreateProfile, type Profile } from '@/src/lib/profile';
import { computeReport, monthToRange, type TradeRow } from '@/src/lib/analytics';

// Returns the current month in YYYY-MM format for the <input type="month" /> control.
function getDefaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Converts an unknown value to a finite number.
 * Used for optional profile fields (e.g., starting_balance) that may be null/string/number.
**/
function toNumberSafe(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Some profile fields might not exist on the generated `Profile` type.
type ProfileExtras = {
  starting_balance?: number | string | null;
  base_currency?: string | null;
};

type TradeNetFields = {
  pnl_amount?: unknown;
  pnl_percent?: unknown;
  commission?: unknown;
  net_pnl?: unknown;
  reviewed_at?: unknown;
};

function calcNetPnl(row: TradeNetFields): { netPnl: number; netPct: number } {
  const gross = Number(row.pnl_amount ?? 0);
  const grossPct = Number(row.pnl_percent ?? 0);

  const isReviewed = !!row.reviewed_at;

  // If not reviewed, treat net_pnl as unavailable and fall back to gross PnL.
  if (!isReviewed) {
    const grossSafe = Number.isFinite(gross) ? gross : 0;
    const pctSafe = Number.isFinite(grossPct) ? grossPct : 0;
    return { netPnl: grossSafe, netPct: pctSafe };
  }

  const commissionVal = Number(row.commission ?? 0);
  const commission = Number.isFinite(commissionVal) ? commissionVal : 0;

  const netVal = Number(row.net_pnl);
  const netPnl = Number.isFinite(netVal) ? netVal : (Number.isFinite(gross) ? gross : 0) - commission;

  // Keep percent consistent with the P&L amount being shown.
  const netPct = gross !== 0 && Number.isFinite(grossPct)
    ? (grossPct * netPnl) / gross
    : grossPct;

  return {
    netPnl: Number.isFinite(netPnl) ? netPnl : 0,
    netPct: Number.isFinite(netPct) ? netPct : 0,
  };
}

export default function MonthlyReportPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [month, setMonth] = useState<string>(getDefaultMonth);
  const [trades, setTrades] = useState<TradeRow[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [msg, setMsg] = useState<string>('');

  // Sum of NET P&L from all trades strictly BEFORE the selected month.
  // Used so this month starts at the previous month’s ending equity.
  const [priorNetPnl, setPriorNetPnl] = useState<number>(0);
  const [loadingPrior, setLoadingPrior] = useState<boolean>(false);

  // Use the browser timezone for daily grouping (matches what the user sees locally).
  const localTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );

  // Read optional fields safely.
  const profileExtras = (profile ?? null) as unknown as ProfileExtras | null;
  const baseCurrency = profileExtras?.base_currency ?? 'USD';

  const baseStartingBalanceRaw = profileExtras?.starting_balance;
  const hasStartingBalance =
    baseStartingBalanceRaw !== null && baseStartingBalanceRaw !== undefined;

  const baseStartingBalance = toNumberSafe(baseStartingBalanceRaw, 0);

  // Load profile + trades in the selected month.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setMsg('');

      try {
        const { profile, user } = await getOrCreateProfile();
        if (!user) {
          router.push('/auth');
          return;
        }

        if (!cancelled) setProfile(profile);

        const { startIso, endIso } = monthToRange(month);

        const { data, error } = await supabase
          .from('trades')
          .select(
            'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, risk_amount, r_multiple, commission, net_pnl, reviewed_at'
          )
          .gte('opened_at', startIso)
          .lt('opened_at', endIso)
          .order('opened_at', { ascending: true });

        if (cancelled) return;

        if (error) {
          console.error(error);
          setTrades([]);
          setMsg(error.message);
          return;
        }

        const rows = (data ?? []) as Array<TradeRow & TradeNetFields>;

        // Map pnl_amount/pnl_percent to NET equivalents so computeReport operates on net.
        const mapped: TradeRow[] = rows.map((r) => {
          const { netPnl, netPct } = calcNetPnl(r);
          return {
            ...r,
            pnl_amount: netPnl,
            pnl_percent: netPct,
          } as TradeRow;
        });

        setTrades(mapped);
      } catch (err: unknown) {
        console.error(err);
        const message =
          err instanceof Error ? err.message : 'Failed to load monthly report';
        if (!cancelled) setMsg(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [month, router]);

  /**
   *  Load NET P&L from all trades strictly BEFORE this month.
   * This makes the equity curve start at the previous month’s ending equity.
  **/
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!hasStartingBalance) {
        if (!cancelled) setPriorNetPnl(0);
        return;
      }

      setLoadingPrior(true);
      try {
        const { startIso } = monthToRange(month);

        const { data, error } = await supabase
          .from('trades')
          .select('pnl_amount, pnl_percent, commission, net_pnl, reviewed_at')
          .lt('opened_at', startIso);

        if (cancelled) return;

        if (error) {
          console.error(error);
          setPriorNetPnl(0);
          return;
        }

        const sum = (data ?? []).reduce((acc, row) => {
          const { netPnl } = calcNetPnl(row as TradeNetFields);
          return acc + netPnl;
        }, 0);

        setPriorNetPnl(sum);
      } catch (err) {
        console.error(err);
        if (!cancelled) setPriorNetPnl(0);
      } finally {
        if (!cancelled) setLoadingPrior(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [month, hasStartingBalance]);

  // Start-of-month balance = profile starting balance + net P&L from all prior trades.
  // If starting balance isn’t set, this will just start at 0.
  const monthStartingBalance = hasStartingBalance
    ? baseStartingBalance + priorNetPnl
    : baseStartingBalance;

  // Compute all report metrics from the net-mapped trade rows.
  const report = useMemo(() => {
    return computeReport({
      trades,
      startingBalance: monthStartingBalance,
      timeZone: localTimeZone,
    });
  }, [trades, monthStartingBalance, localTimeZone]);

  return (
    <main className='p-6 space-y-6'>
      {/* Header */}
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Monthly Report</h1>
        </div>

        <div className='flex gap-2'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </div>
      </header>

      {/* Month selector */}
      <section className='flex items-center gap-3'>
        <label className='text-sm opacity-80'>Month:</label>
        <input
          className='border rounded-lg p-2'
          type='month'
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </section>

      {loading && <p className='opacity-80'>Loading…</p>}
      {msg && <p className='opacity-80'>{msg}</p>}

      {!loading && (
        <>
          {/* Equity Curve */}
          <section className='border rounded-xl p-4 space-y-3'>
            <div className='flex items-center justify-between gap-4'>
              <h2 className='font-semibold'>Equity Curve</h2>
              <div className='text-sm opacity-70'>
                Start:{' '}
                {loadingPrior
                  ? '…'
                  : `${report.startingBalance.toFixed(2)} ${baseCurrency}`}
                {' '}• End: {report.endingBalance.toFixed(2)} {baseCurrency}
              </div>
            </div>

            {/* Minimal in-page chart for portability (no chart libs) */}
            <LineChart
              values={[report.startingBalance, ...report.daily.map((p) => p.equity)]}
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
            <Card title='RRR' value={report.rrr.toFixed(2)} />
            <Card
              title='Expectancy / Trade'
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

            {/* These are computed from the (net) pnl_amount values, so they represent NET profit/loss totals. */}
            <Card title='Net Profit' value={report.grossProfit.toFixed(2)} />
            <Card title='Net Loss' value={report.grossLossAbs.toFixed(2)} />
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
                    <th className='p-2'>Net P&amp;L</th>
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

          {/* Daily table (helps verify numbers quickly) */}
          <section className='border rounded-xl p-4 space-y-3'>
            <h2 className='font-semibold'>Daily Results</h2>
            <div className='overflow-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-left border-b'>
                    <th className='p-2'>Day</th>
                    <th className='p-2'>Daily P&amp;L</th>
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

function Card({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <div className='border rounded-xl p-4'>
      <div className='text-sm opacity-70'>{title}</div>
      <div className='text-xl font-semibold'>{value}</div>
    </div>
  );
}

/**
 * Minimal SVG line chart (no libraries).
 * Renders only an axis + a line and highlights the latest point.
**/
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
    return { x, y, label: labels[i] ?? '' };
  });

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  return (
    <div className='w-full overflow-x-auto'>
      <svg
        width={width}
        height={height}
        className='block'
        role='img'
        aria-label='Equity curve'>
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