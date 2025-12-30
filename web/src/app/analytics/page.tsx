'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { getOrCreateProfile, type Profile } from '@/src/lib/profile';

type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
type Direction = 'BUY' | 'SELL';

type Session = 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP';

function getSessionUTC(iso: string): Session {
  const h = new Date(iso).getUTCHours();

  if (h >= 21 || h <= 6) return 'ASIA';
  if (h >= 7 && h <= 11) return 'LONDON';
  if (h >= 12 && h <= 15) return 'OVERLAP';
  return 'NEW_YORK';
}

function sessionLabel(s: Session) {
  if (s === 'ASIA') return 'Asia';
  if (s === 'LONDON') return 'London';
  if (s === 'OVERLAP') return 'London–NY Overlap';
  return 'New York';
}

type Filters = {
  rangeStart: string;
  rangeEnd: string;
  instrumentQuery: string;
  directionFilter: '' | Direction;
  sessionFilter: '' | Session;
  outcomeFilter: '' | Outcome;
  reviewedFilter: '' | 'REVIEWED' | 'NOT_REVIEWED';
  setupFilter: '' | 'NO_SETUP' | string;
};

function normalizeFilters(f: Filters): Filters {
  return {
    ...f,
    instrumentQuery: f.instrumentQuery.trim(),
  };
}

function filtersEqual(a: Filters, b: Filters) {
  const A = normalizeFilters(a);
  const B = normalizeFilters(b);
  return (
    A.rangeStart === B.rangeStart &&
    A.rangeEnd === B.rangeEnd &&
    A.instrumentQuery === B.instrumentQuery &&
    A.directionFilter === B.directionFilter &&
    A.sessionFilter === B.sessionFilter &&
    A.outcomeFilter === B.outcomeFilter &&
    A.reviewedFilter === B.reviewedFilter &&
    A.setupFilter === B.setupFilter
  );
}

type Trade = {
  id: string;
  opened_at: string;
  closed_at: string | null;

  instrument: string;
  direction: Direction;
  outcome: Outcome;

  pnl_amount: number;
  pnl_percent: number;

  commission: number | null;
  net_pnl: number | null;
  r_multiple: number | null;

  reviewed_at: string | null;
  template_id: string | null;
};

type SetupTemplate = {
  id: string;
  name: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function toNumberSafe(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(amount: number, maxDigits = 2) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: maxDigits,
  }).format(amount);
}

function formatPercent(amount: number, maxDigits = 2) {
  return `${formatNumber(amount, maxDigits)}%`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function signColor(n: number) {
  if (n > 0) return 'text-emerald-700';
  if (n < 0) return 'text-rose-700';
  return 'text-slate-800';
}

function yyyyMmDd(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yyyyMm(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function calcNetPnl(t: Trade) {
  if (t.net_pnl !== null && t.net_pnl !== undefined) return Number(t.net_pnl);
  const gross = Number(t.pnl_amount || 0);
  const comm = Number(t.commission || 0);
  return gross - comm;
}

// Lightweight SVG charts.

function SvgLineChart({
  title,
  subtitle,
  points,
  height = 220,
  yFormatter,
}: {
  title: string;
  subtitle?: string;
  points: Array<{ xLabel: string; y: number }>;
  height?: number;
  yFormatter: (y: number) => string;
}) {
  const width = 820;
  const pad = 30;

  const ys = points.map((p) => p.y);
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;
  const range = maxY - minY || 1;

  const xStep = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const toX = (i: number) => pad + i * xStep;
  const toY = (y: number) =>
    pad + (height - pad * 2) * (1 - (y - minY) / range);

  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(2)} ${toY(p.y).toFixed(2)}`
    )
    .join(' ');

  const y0 = toY(0);
  const axisY = clamp(y0, pad, height - pad);

  const ticks = 4;
  const tickVals = Array.from(
    { length: ticks + 1 },
    (_, i) => minY + (range * i) / ticks
  );

  return (
    <div className='border rounded-xl p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='font-semibold'>{title}</div>
          {subtitle && <div className='text-xs opacity-70'>{subtitle}</div>}
        </div>
        <div className='text-xs opacity-70'>
          {points.length
            ? `${points[0].xLabel} → ${points[points.length - 1].xLabel}`
            : '—'}
        </div>
      </div>

      <div className='mt-3 w-full overflow-x-auto'>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className='w-full min-w-[680px]'
          role='img'
          aria-label={title}>
          <rect x='0' y='0' width={width} height={height} fill='white' />

          {tickVals.map((v, i) => {
            const y = toY(v);
            return (
              <g key={i}>
                <line
                  x1={pad}
                  y1={y}
                  x2={width - pad}
                  y2={y}
                  stroke='rgba(0,0,0,0.08)'
                />
                <text x={6} y={y + 4} fontSize='10' fill='rgba(0,0,0,0.55)'>
                  {yFormatter(v)}
                </text>
              </g>
            );
          })}

          <line
            x1={pad}
            y1={axisY}
            x2={width - pad}
            y2={axisY}
            stroke='rgba(0,0,0,0.18)'
          />

          <path
            d={path}
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            className='text-slate-900'
          />

          {points.map((p, i) => (
            <circle
              key={i}
              cx={toX(i)}
              cy={toY(p.y)}
              r='2.5'
              fill='currentColor'
              className='text-slate-900'
            />
          ))}

          {points.map((p, i) => {
            if (points.length > 20) {
              const step = Math.ceil(points.length / 10);
              if (i % step !== 0 && i !== points.length - 1) return null;
            }
            return (
              <text
                key={i}
                x={toX(i)}
                y={height - 8}
                fontSize='10'
                fill='rgba(0,0,0,0.55)'
                textAnchor='middle'>
                {p.xLabel.slice(5)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function SvgBarChart({
  title,
  subtitle,
  bars,
  height = 220,
  yFormatter,
  xLabelFormatter,
}: {
  title: string;
  subtitle?: string;
  bars: Array<{ xLabel: string; y: number }>;
  height?: number;
  yFormatter: (y: number) => string;
  xLabelFormatter?: (x: string) => string;
}) {
  const width = 820;
  const pad = 30;

  const ys = bars.map((b) => b.y);
  const minY = ys.length ? Math.min(...ys, 0) : 0;
  const maxY = ys.length ? Math.max(...ys, 0) : 1;
  const range = maxY - minY || 1;

  const plotW = width - pad * 2;
  const barW = bars.length ? plotW / bars.length : plotW;
  const gap = Math.min(10, barW * 0.2);
  const innerW = Math.max(2, barW - gap);

  const toY = (y: number) =>
    pad + (height - pad * 2) * (1 - (y - minY) / range);
  const y0 = toY(0);

  const ticks = 4;
  const tickVals = Array.from(
    { length: ticks + 1 },
    (_, i) => minY + (range * i) / ticks
  );

  return (
    <div className='border rounded-xl p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='font-semibold'>{title}</div>
          {subtitle && <div className='text-xs opacity-70'>{subtitle}</div>}
        </div>
        <div className='text-xs opacity-70'>
          {bars.length
            ? `${bars[0].xLabel} → ${bars[bars.length - 1].xLabel}`
            : '—'}
        </div>
      </div>

      <div className='mt-3 w-full overflow-x-auto'>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className='w-full min-w-[680px]'
          role='img'
          aria-label={title}>
          <rect x='0' y='0' width={width} height={height} fill='white' />

          {tickVals.map((v, i) => {
            const y = toY(v);
            return (
              <g key={i}>
                <line
                  x1={pad}
                  y1={y}
                  x2={width - pad}
                  y2={y}
                  stroke='rgba(0,0,0,0.08)'
                />
                <text x={6} y={y + 4} fontSize='10' fill='rgba(0,0,0,0.55)'>
                  {yFormatter(v)}
                </text>
              </g>
            );
          })}

          <line
            x1={pad}
            y1={y0}
            x2={width - pad}
            y2={y0}
            stroke='rgba(0,0,0,0.18)'
          />

          {bars.map((b, i) => {
            const x = pad + i * barW + gap / 2;
            const yPos = toY(Math.max(b.y, 0));
            const yNeg = toY(Math.min(b.y, 0));
            const h = Math.abs(yNeg - yPos);
            const barY = b.y >= 0 ? yPos : yNeg;

            return (
              <g key={i}>
                <rect
                  x={x}
                  y={barY}
                  width={innerW}
                  height={Math.max(1, h)}
                  fill='currentColor'
                  className={b.y >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                  opacity={0.9}
                  rx={3}
                />
                <text
                  x={x + innerW / 2}
                  y={height - 8}
                  fontSize='10'
                  fill='rgba(0,0,0,0.55)'
                  textAnchor='middle'>
                  {xLabelFormatter ? xLabelFormatter(b.xLabel) : b.xLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function CalendarHeatmap({
  title,
  month,
  valueByDay,
  modeLabel,
  valueFormatter,
}: {
  title: string;
  month: string; // YYYY-MM
  valueByDay: Record<string, number>;
  modeLabel: string;
  valueFormatter: (n: number) => string;
}) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const firstDow = first.getDay(); // 0 Sun..6 Sat
  const daysInMonth = last.getDate();

  const cells: Array<{ date: Date | null; key: string; value: number | null }> =
    [];

  for (let i = 0; i < firstDow; i++)
    cells.push({ date: null, key: `pad-${i}`, value: null });

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(
      2,
      '0'
    )}`;
    const v = Object.prototype.hasOwnProperty.call(valueByDay, key)
      ? valueByDay[key]
      : null;
    cells.push({ date: new Date(y, m - 1, d), key, value: v });
  }

  while (cells.length % 7 !== 0)
    cells.push({ date: null, key: `pad-end-${cells.length}`, value: null });

  const vals = Object.values(valueByDay);
  const maxAbs = vals.length ? Math.max(...vals.map((v) => Math.abs(v))) : 0;

  function cellClass(v: number | null) {
    if (v === null) return 'bg-slate-50';
    if (!maxAbs) return 'bg-slate-100';

    const intensity = clamp(Math.abs(v) / maxAbs, 0, 1);
    const step =
      intensity > 0.75 ? 4 : intensity > 0.5 ? 3 : intensity > 0.25 ? 2 : 1;

    if (v > 0)
      return step === 4
        ? 'bg-emerald-500'
        : step === 3
        ? 'bg-emerald-400'
        : step === 2
        ? 'bg-emerald-300'
        : 'bg-emerald-200';
    if (v < 0)
      return step === 4
        ? 'bg-rose-500'
        : step === 3
        ? 'bg-rose-400'
        : step === 2
        ? 'bg-rose-300'
        : 'bg-rose-200';
    return 'bg-slate-200';
  }

  return (
    <div className='border rounded-xl p-4'>
      <div className='flex items-center justify-between gap-3 flex-wrap'>
        <div className='font-semibold'>{title}</div>
        <div className='text-xs opacity-70'>
          {month} • {modeLabel}
        </div>
      </div>

      <div className='mt-3 grid grid-cols-7 gap-2'>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className='text-xs opacity-60 text-center'>
            {d}
          </div>
        ))}

        {cells.map((c) => {
          const label = c.date ? c.date.getDate() : '';
          const v = c.value;
          const tooltip =
            c.date && v !== null
              ? `${c.key}: ${valueFormatter(v)}`
              : c.date
              ? `${c.key}: no trades`
              : '';

          return (
            <div
              key={c.key}
              title={tooltip}
              className={cx(
                'h-10 rounded-lg border flex items-center justify-center text-xs',
                c.date ? 'border-slate-200' : 'border-transparent',
                cellClass(v)
              )}>
              <span
                className={cx(
                  'font-medium',
                  v === null ? 'opacity-50' : 'text-white'
                )}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className='mt-3 text-xs opacity-70'>
        Hover a day to see its value. Days with no trades are light.
      </div>
    </div>
  );
}

// Page

export default function AnalyticsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);

  // The generated `Profile` type may not include all columns stored; safely read optional extras.
  type ProfileExtras = {
    base_currency?: string | null;
    starting_balance?: number | string | null;
  };

  const profileExtras = (profile ?? null) as unknown as ProfileExtras | null;

  const currency = profileExtras?.base_currency ?? 'USD';
  const startingBalanceRaw = profileExtras?.starting_balance;
  const hasStartingBalance =
    startingBalanceRaw !== null && startingBalanceRaw !== undefined;
  const startingBalance = hasStartingBalance
    ? toNumberSafe(startingBalanceRaw)
    : 0;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const today = useMemo(() => new Date(), []);

  const initialFilters = useMemo<Filters>(() => {
    return {
      rangeStart: yyyyMmDd(addDays(today, -90).toISOString()),
      rangeEnd: yyyyMmDd(today.toISOString()),
      instrumentQuery: '',
      directionFilter: '',
      sessionFilter: '',
      outcomeFilter: '',
      reviewedFilter: '',
      setupFilter: '',
    };
  }, [today]);

  // `draft` is what the UI edits; `applied` is what actually drives queries + derived analytics.
  const [draft, setDraft] = useState<Filters>(() => initialFilters);
  const [applied, setApplied] = useState<Filters>(() => initialFilters);

  // Setup templates populate the Setup filter dropdown.
  const [setupTemplates, setSetupTemplates] = useState<SetupTemplate[]>([]);

  const [calendarMonth, setCalendarMonth] = useState(() =>
    yyyyMm(today.toISOString())
  );
  const [calendarMode, setCalendarMode] = useState<
    'PNL_PERCENT' | 'PNL_DOLLAR'
  >('PNL_PERCENT');

  const [trades, setTrades] = useState<Trade[]>([]);

  // Filters panel is collapsible to keep the page focused on charts.
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (applied.instrumentQuery.trim()) c++;
    if (applied.directionFilter) c++;
    if (applied.outcomeFilter) c++;
    if (applied.reviewedFilter) c++;
    if (applied.setupFilter) c++;
    if (applied.sessionFilter) c++;
    return c;
  }, [applied]);

  const filtersSummary = useMemo(() => {
    const bits: string[] = [];
    bits.push(`${applied.rangeStart} → ${applied.rangeEnd}`);

    if (applied.instrumentQuery.trim())
      bits.push(`Instrument: ${applied.instrumentQuery.trim().toUpperCase()}`);
    if (applied.directionFilter) bits.push(`Dir: ${applied.directionFilter}`);
    if (applied.sessionFilter)
      bits.push(`Session: ${sessionLabel(applied.sessionFilter)}`);
    if (applied.outcomeFilter) bits.push(`Outcome: ${applied.outcomeFilter}`);
    if (applied.reviewedFilter === 'REVIEWED') bits.push(`Reviewed`);
    if (applied.reviewedFilter === 'NOT_REVIEWED') bits.push(`Not reviewed`);

    if (applied.setupFilter === 'NO_SETUP') bits.push('Setup: none');
    else if (applied.setupFilter) {
      const name = setupTemplates.find((s) => s.id === applied.setupFilter)?.name;
      bits.push(`Setup: ${name || 'Selected'}`);
    }

    return bits.join(' • ');
  }, [applied, setupTemplates]);

  const hasUnsavedChanges = useMemo(() => !filtersEqual(draft, applied), [draft, applied]);

  useEffect(() => {
    (async () => {
      try {
        const { profile, user } = await getOrCreateProfile();
        if (!user) return router.push('/auth');
        setProfile(profile);
      } catch {
        router.push('/auth');
      }
    })();
  }, [router]);

  // Load setup templates
  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('setup_templates')
        .select('id, name')
        .order('created_at', { ascending: true });

      if (error) {
        console.error(error);
        setSetupTemplates([]);
        return;
      }

      setSetupTemplates((data || []) as SetupTemplate[]);
    })();
  }, []);

  // Fetch trades for the selected date range (ordered for deterministic charts/stats).
  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg('');

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return router.push('/auth');

      const start = startOfDay(new Date(`${applied.rangeStart}T00:00:00`));
      const end = endOfDay(new Date(`${applied.rangeEnd}T00:00:00`));

      const { data, error } = await supabase
        .from('trades')
        .select(
          `id, opened_at, closed_at,
           instrument, direction, outcome,
           pnl_amount, pnl_percent,
           commission, net_pnl, r_multiple,
           reviewed_at, template_id`
        )
        .gte('opened_at', start.toISOString())
        .lte('opened_at', end.toISOString())
        .order('opened_at', { ascending: true });

      if (error) {
        console.error(error);
        setMsg(error.message);
        setTrades([]);
        setLoading(false);
        return;
      }

      setTrades((data || []) as Trade[]);
      setLoading(false);
    })();
  }, [applied.rangeStart, applied.rangeEnd, router]);

  // Apply all non-date filters client-side to the already-fetched trade list.
  const filteredTrades = useMemo(() => {
    const q = applied.instrumentQuery.trim().toUpperCase();

    return trades.filter((t) => {
      if (q && !t.instrument?.toUpperCase().includes(q)) return false;
      if (applied.directionFilter && t.direction !== applied.directionFilter) return false;
      if (applied.sessionFilter && getSessionUTC(t.opened_at) !== applied.sessionFilter) return false;
      if (applied.outcomeFilter && t.outcome !== applied.outcomeFilter) return false;
      if (applied.reviewedFilter === 'REVIEWED' && !t.reviewed_at) return false;
      if (applied.reviewedFilter === 'NOT_REVIEWED' && !!t.reviewed_at) return false;

      // setup filter:
      // - '' => all
      // - 'NO_SETUP' => template_id is null
      // - template id => match template_id
      if (applied.setupFilter === 'NO_SETUP' && t.template_id !== null) return false;
      if (
        applied.setupFilter &&
        applied.setupFilter !== 'NO_SETUP' &&
        t.template_id !== applied.setupFilter
      )
        return false;

      return true;
    });
  }, [trades, applied]);

  const stats = useMemo(() => {
    const list = filteredTrades;

    const totalTrades = list.length;
    const winners = list.filter((t) => t.outcome === 'WIN');
    const losers = list.filter((t) => t.outcome === 'LOSS');

    const winCount = winners.length;
    const lossCount = losers.length;
    const beCount = list.filter((t) => t.outcome === 'BREAKEVEN').length;

    const netPnls = list.map(calcNetPnl);
    const totalPnl = netPnls.reduce((s, v) => s + v, 0);

    const winRate = totalTrades ? (winCount / totalTrades) * 100 : 0;

    const grossProfit = netPnls.filter((v) => v > 0).reduce((s, v) => s + v, 0);
    const grossLossAbs = Math.abs(
      netPnls.filter((v) => v < 0).reduce((s, v) => s + v, 0)
    );
    const profitFactor =
      grossLossAbs > 0
        ? grossProfit / grossLossAbs
        : grossProfit > 0
        ? Infinity
        : 0;

    const avgWin = winCount
      ? winners.map(calcNetPnl).reduce((s, v) => s + v, 0) / winCount
      : 0;

    const avgLossAbs = lossCount
      ? Math.abs(losers.map(calcNetPnl).reduce((s, v) => s + v, 0) / lossCount)
      : 0;

    const rrr =
      avgLossAbs > 0 ? avgWin / avgLossAbs : avgWin > 0 ? Infinity : 0;

    const lossRate = 1 - (totalTrades ? winCount / totalTrades : 0);
    const expectancy = (winRate / 100) * avgWin - lossRate * avgLossAbs;

    const durationsMin = list
      .filter((t) => t.closed_at)
      .map(
        (t) =>
          (new Date(t.closed_at as string).getTime() -
            new Date(t.opened_at).getTime()) /
          60000
      )
      .filter((n) => Number.isFinite(n) && n >= 0);

    const avgDurationMin = durationsMin.length
      ? durationsMin.reduce((s, v) => s + v, 0) / durationsMin.length
      : 0;

    // streaks
    const seq = list.map((t) =>
      t.outcome === 'WIN' ? 'W' : t.outcome === 'LOSS' ? 'L' : 'B'
    );
    let maxW = 0,
      maxL = 0,
      curW = 0,
      curL = 0;
    const winRuns: number[] = [];
    const lossRuns: number[] = [];

    for (const s of seq) {
      if (s === 'W') {
        curW += 1;
        maxW = Math.max(maxW, curW);
        if (curL) lossRuns.push(curL);
        curL = 0;
      } else if (s === 'L') {
        curL += 1;
        maxL = Math.max(maxL, curL);
        if (curW) winRuns.push(curW);
        curW = 0;
      } else {
        if (curW) winRuns.push(curW);
        if (curL) lossRuns.push(curL);
        curW = 0;
        curL = 0;
      }
    }
    if (curW) winRuns.push(curW);
    if (curL) lossRuns.push(curL);

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const bestTrade = netPnls.length ? Math.max(...netPnls) : 0;
    const worstTrade = netPnls.length ? Math.min(...netPnls) : 0;

    return {
      totalTrades,
      winCount,
      lossCount,
      beCount,
      totalPnl,
      winRate,
      profitFactor,
      avgWin,
      avgLossAbs,
      rrr,
      expectancy,
      avgDurationMin,
      bestTrade,
      worstTrade,
      maxConsecutiveWins: maxW,
      avgConsecutiveWins: avg(winRuns),
      maxConsecutiveLosses: maxL,
      avgConsecutiveLosses: avg(lossRuns),
    };
  }, [filteredTrades]);

  // Build an equity curve by aggregating net PnL per day, then cumulatively summing.
  // If a starting balance is set, plot equity; otherwise plot cumulative net PnL.
  const equitySeries = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const t of filteredTrades) {
      const day = yyyyMmDd(t.opened_at);
      byDay[day] = (byDay[day] || 0) + calcNetPnl(t);
    }

    const days = Object.keys(byDay).sort();

    const res = days.reduce(
      (acc, d) => {
        acc.cum += byDay[d] || 0;
        const y = hasStartingBalance ? startingBalance + acc.cum : acc.cum;
        acc.series.push({ xLabel: d, y });
        return acc;
      },
      { cum: 0, series: [] as Array<{ xLabel: string; y: number }> }
    );

    return res.series;
  }, [filteredTrades, hasStartingBalance, startingBalance]);

  const dailyNetSeries = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const t of filteredTrades) {
      const day = yyyyMmDd(t.opened_at);
      byDay[day] = (byDay[day] || 0) + calcNetPnl(t);
    }
    return Object.keys(byDay)
      .sort()
      .map((d) => ({ xLabel: d, y: byDay[d] }));
  }, [filteredTrades]);

  const monthlyNetBars = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const t of filteredTrades) {
      const m = yyyyMm(t.opened_at);
      byMonth[m] = (byMonth[m] || 0) + calcNetPnl(t);
    }
    return Object.keys(byMonth)
      .sort()
      .map((m) => ({ xLabel: m, y: byMonth[m] }));
  }, [filteredTrades]);

  const dayOfWeekBars = useMemo(() => {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const byDow: number[] = Array(7).fill(0);

    for (const t of filteredTrades) {
      const d = new Date(t.opened_at);
      const dow = d.getDay();
      byDow[dow] += calcNetPnl(t);
    }

    return labels.map((lbl, i) => ({ xLabel: lbl, y: byDow[i] }));
  }, [filteredTrades]);

  // Hour-of-day performance based on the user's local time (uses `Date.getHours()`).
  const hourBars = useMemo(() => {
    const byHour: number[] = Array(24).fill(0);
    for (const t of filteredTrades) {
      const d = new Date(t.opened_at);
      const h = d.getHours();
      byHour[h] += calcNetPnl(t);
    }
    return byHour.map((v, h) => ({ xLabel: String(h), y: v }));
  }, [filteredTrades]);

  const symbolRanking = useMemo(() => {
    const map: Record<
      string,
      {
        symbol: string;
        pnl: number;
        trades: number;
        wins: number;
        losses: number;
      }
    > = {};

    for (const t of filteredTrades) {
      const s = (t.instrument || 'UNKNOWN').toUpperCase();
      if (!map[s])
        map[s] = { symbol: s, pnl: 0, trades: 0, wins: 0, losses: 0 };
      map[s].pnl += calcNetPnl(t);
      map[s].trades += 1;
      if (t.outcome === 'WIN') map[s].wins += 1;
      if (t.outcome === 'LOSS') map[s].losses += 1;
    }

    return Object.values(map).sort((a, b) => b.pnl - a.pnl);
  }, [filteredTrades]);

  const topSymbols = symbolRanking.slice(0, 5);
  const bottomSymbols = symbolRanking.slice(-5).reverse();

  const directionPerf = useMemo(() => {
    const by: Record<
      Direction,
      {
        dir: Direction;
        trades: number;
        pnl: number;
        wins: number;
        losses: number;
      }
    > = {
      BUY: { dir: 'BUY', trades: 0, pnl: 0, wins: 0, losses: 0 },
      SELL: { dir: 'SELL', trades: 0, pnl: 0, wins: 0, losses: 0 },
    };

    for (const t of filteredTrades) {
      by[t.direction].trades += 1;
      by[t.direction].pnl += calcNetPnl(t);
      if (t.outcome === 'WIN') by[t.direction].wins += 1;
      if (t.outcome === 'LOSS') by[t.direction].losses += 1;
    }

    return Object.values(by).map((r) => ({
      ...r,
      winRate: r.trades ? (r.wins / r.trades) * 100 : 0,
    }));
  }, [filteredTrades]);

  const calendarValueByDay = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const t of filteredTrades) {
      const day = yyyyMmDd(t.opened_at);
      if (!day.startsWith(calendarMonth)) continue;

      if (calendarMode === 'PNL_PERCENT')
        byDay[day] = (byDay[day] || 0) + Number(t.pnl_percent || 0);
      else byDay[day] = (byDay[day] || 0) + calcNetPnl(t);
    }
    return byDay;
  }, [filteredTrades, calendarMonth, calendarMode]);

  const sharpe = useMemo(() => {
    if (dailyNetSeries.length < 2) return null;

    const denom =
      hasStartingBalance && startingBalance > 0 ? startingBalance : 1;
    const returns = dailyNetSeries.map((p) => p.y / denom);

    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const variance =
      returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) /
      (returns.length - 1);
    const std = Math.sqrt(variance);

    if (!std || !Number.isFinite(std)) return null;
    const annualized = (mean / std) * Math.sqrt(252);
    return Number.isFinite(annualized) ? annualized : null;
  }, [dailyNetSeries, hasStartingBalance, startingBalance]);

  async function logout() {
    await supabase.auth.signOut();
    router.push('/auth');
  }

  return (
    <main className='p-6 space-y-6'>
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Analytics</h1>
          <div className='text-sm opacity-80'>
            All metrics and charts update with filters.
          </div>
          {!hasStartingBalance && (
            <div className='text-sm opacity-80'>
              <span className='font-semibold'>Tip:</span> Set Starting Balance
              on Dashboard to show true equity.
            </div>
          )}
        </div>

        <div className='flex gap-2 flex-wrap'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/dashboard')}>
            Back
          </button>
          <button className='border rounded-lg px-4 py-2' onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {/* Filters (collapsible) */}
      <section className='border rounded-xl p-4 space-y-3'>
        <div className='flex items-start justify-between gap-3 flex-wrap'>
          <div>
            <div className='font-semibold'>Filters</div>
            <div className='text-xs opacity-70 mt-1'>{filtersSummary}</div>
          </div>

          <div className='flex gap-2 items-center flex-wrap'>
            {activeFilterCount > 0 && (
              <span className='text-xs border rounded-full px-2 py-1 bg-slate-50'>
                {activeFilterCount} active
              </span>
            )}

            {hasUnsavedChanges && (
              <span className='text-xs border rounded-full px-2 py-1 bg-amber-50 border-amber-200 text-amber-900'>
                Unsaved changes
              </span>
            )}

            <button
              type='button'
              className={cx(
                'border rounded-lg px-4 py-2',
                hasUnsavedChanges ? 'bg-slate-900 text-white border-slate-900' : 'opacity-50 cursor-not-allowed'
              )}
              disabled={!hasUnsavedChanges}
              onClick={() => setApplied(normalizeFilters(draft))}>
              Apply filters
            </button>

            <button
              type='button'
              className='border rounded-lg px-4 py-2'
              onClick={() => setShowFilters((v) => !v)}>
              {showFilters ? 'Hide filters' : 'Show filters'}
            </button>
          </div>
        </div>

        {showFilters && (
          <>
            <div className='grid grid-cols-1 md:grid-cols-4 gap-3'>
              <Field label='Start'>
                <input
                  className='w-full border rounded-lg p-3'
                  type='date'
                  value={draft.rangeStart}
                  onChange={(e) => setDraft((p) => ({ ...p, rangeStart: e.target.value }))}
                />
              </Field>

              <Field label='End'>
                <input
                  className='w-full border rounded-lg p-3'
                  type='date'
                  value={draft.rangeEnd}
                  onChange={(e) => setDraft((p) => ({ ...p, rangeEnd: e.target.value }))}
                />
              </Field>

              <Field label='Instrument'>
                <input
                  className='w-full border rounded-lg p-3'
                  placeholder='e.g. EURUSD'
                  value={draft.instrumentQuery}
                  onChange={(e) => setDraft((p) => ({ ...p, instrumentQuery: e.target.value }))}
                />
              </Field>

              <Field label='Reviewed'>
                <select
                  className='w-full border rounded-lg p-3'
                  value={draft.reviewedFilter}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      reviewedFilter: e.target.value as Filters['reviewedFilter'],
                    }))
                  }>
                  <option value=''>All</option>
                  <option value='REVIEWED'>Reviewed</option>
                  <option value='NOT_REVIEWED'>Not reviewed</option>
                </select>
              </Field>

              <Field label='Direction'>
                <select
                  className='w-full border rounded-lg p-3'
                  value={draft.directionFilter}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      directionFilter: e.target.value as Filters['directionFilter'],
                    }))
                  }>
                  <option value=''>All</option>
                  <option value='BUY'>BUY</option>
                  <option value='SELL'>SELL</option>
                </select>
              </Field>

              <Field label='Session (UTC)'>
                <select
                  className='w-full border rounded-lg p-3'
                  value={draft.sessionFilter}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      sessionFilter: e.target.value as Filters['sessionFilter'],
                    }))
                  }>
                  <option value=''>All</option>
                  <option value='ASIA'>Asia</option>
                  <option value='LONDON'>London</option>
                  <option value='OVERLAP'>London–NY Overlap</option>
                  <option value='NEW_YORK'>New York</option>
                </select>
              </Field>

              <Field label='Setup'>
                <select
                  className='w-full border rounded-lg p-3'
                  value={draft.setupFilter}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      setupFilter: e.target.value as Filters['setupFilter'],
                    }))
                  }>
                  <option value=''>All</option>
                  <option value='NO_SETUP'>No setup</option>
                  {setupTemplates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label='Outcome'>
                <select
                  className='w-full border rounded-lg p-3'
                  value={draft.outcomeFilter}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      outcomeFilter: e.target.value as Filters['outcomeFilter'],
                    }))
                  }>
                  <option value=''>All</option>
                  <option value='WIN'>WIN</option>
                  <option value='LOSS'>LOSS</option>
                  <option value='BREAKEVEN'>BREAKEVEN</option>
                </select>
              </Field>

              <div className='md:col-span-2 flex items-end gap-2'>
                <button
                  className='border rounded-lg px-4 py-3 w-full'
                  type='button'
                  onClick={() => {
                    const cleared: Filters = {
                      ...draft,
                      instrumentQuery: '',
                      directionFilter: '',
                      sessionFilter: '',
                      outcomeFilter: '',
                      reviewedFilter: '',
                      setupFilter: '',
                    };
                    setDraft(cleared);
                    setApplied(normalizeFilters(cleared));
                  }}>
                  Clear filters
                </button>
              </div>
            </div>

            <div className='text-xs opacity-70'>
              Loaded: <span className='font-semibold'>{trades.length}</span> •
              Showing:{' '}
              <span className='font-semibold'>{filteredTrades.length}</span>
            </div>
          </>
        )}

        {!showFilters && (
          <div className='text-xs opacity-70'>
            Loaded: <span className='font-semibold'>{trades.length}</span> •
            Showing:{' '}
            <span className='font-semibold'>{filteredTrades.length}</span>
          </div>
        )}
      </section>

      {msg && <p className='text-sm opacity-80'>{msg}</p>}
      {loading && <p className='text-sm opacity-80'>Loading…</p>}

      {/* Summary cards */}
      <section className='grid grid-cols-2 md:grid-cols-4 gap-3'>
        <Card
          title='Total PnL'
          value={formatMoney(stats.totalPnl, currency)}
          valueClassName={signColor(stats.totalPnl)}
        />
        <Card title='Win Rate' value={formatPercent(stats.winRate, 0)} />
        <Card title='Total Trades' value={stats.totalTrades} />
        <Card
          title='Profit Factor'
          value={
            stats.profitFactor === Infinity
              ? '∞'
              : Number.isFinite(stats.profitFactor)
              ? formatNumber(stats.profitFactor, 2)
              : '—'
          }
        />

        <Card
          title='Avg Profit'
          value={formatMoney(stats.avgWin, currency)}
          valueClassName='text-emerald-700'
        />
        <Card
          title='Avg Loss'
          value={formatMoney(stats.avgLossAbs, currency)}
          valueClassName='text-rose-700'
        />
        <Card
          title='RRR'
          value={
            stats.rrr === Infinity
              ? '∞'
              : Number.isFinite(stats.rrr)
              ? formatNumber(stats.rrr, 2)
              : '—'
          }
        />
        <Card
          title='Expectancy / trade'
          value={formatMoney(stats.expectancy, currency)}
          valueClassName={signColor(stats.expectancy)}
        />

        <Card
          title='Sharpe (daily)'
          value={sharpe === null ? '—' : formatNumber(sharpe, 2)}
        />
        <Card
          title='Best Trade'
          value={formatMoney(stats.bestTrade, currency)}
          valueClassName='text-emerald-700'
        />
        <Card
          title='Worst Trade'
          value={formatMoney(stats.worstTrade, currency)}
          valueClassName='text-rose-700'
        />
        <Card
          title='Avg Duration'
          value={
            stats.avgDurationMin
              ? `${formatNumber(stats.avgDurationMin, 0)} min`
              : '—'
          }
        />
      </section>

      {/* Equity curve + daily net */}
      <section className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
        <SvgLineChart
          title={
            hasStartingBalance
              ? 'Equity Curve (daily)'
              : 'Cumulative Net PnL (daily)'
          }
          subtitle={
            hasStartingBalance
              ? `Starting balance: ${formatMoney(startingBalance, currency)}`
              : 'Set starting balance for true equity'
          }
          points={equitySeries}
          yFormatter={(y) => formatMoney(y, currency)}
        />

        <SvgBarChart
          title='Daily Net PnL'
          subtitle='Sum of net PnL per day'
          bars={dailyNetSeries.map((p) => ({
            xLabel: p.xLabel.slice(5),
            y: p.y,
          }))}
          yFormatter={(y) => formatMoney(y, currency)}
        />
      </section>

      {/* Monthly + day/hour */}
      <section className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
        <SvgBarChart
          title='Performance by Month'
          subtitle='Net PnL per month'
          bars={monthlyNetBars.map((b) => ({ xLabel: b.xLabel, y: b.y }))}
          yFormatter={(y) => formatMoney(y, currency)}
          xLabelFormatter={(x) => x.slice(5)}
        />

        <SvgBarChart
          title='Performance by Day'
          subtitle='Net PnL by day-of-week'
          bars={dayOfWeekBars}
          yFormatter={(y) => formatMoney(y, currency)}
        />
      </section>

      <section className='grid grid-cols-1 gap-3'>
        <SvgBarChart
          title='Performance by Time'
          subtitle='Net PnL by hour (based on trade opened_at local time)'
          bars={hourBars}
          yFormatter={(y) => formatMoney(y, currency)}
        />
      </section>

      {/* Direction + streaks + symbols */}
      <section className='grid grid-cols-1 lg:grid-cols-3 gap-3'>
        <div className='border rounded-xl p-4 lg:col-span-1 space-y-4'>
          <div>
            <div className='font-semibold'>Performance by Direction</div>
            <div className='mt-3 space-y-2 text-sm'>
              {directionPerf.map((d) => (
                <div key={d.dir} className='border rounded-lg p-3'>
                  <div className='flex items-center justify-between'>
                    <div className='font-semibold'>{d.dir}</div>
                    <div className={cx('font-semibold', signColor(d.pnl))}>
                      {formatMoney(d.pnl, currency)}
                    </div>
                  </div>
                  <div className='text-xs opacity-70 mt-1'>
                    Trades: <span className='font-semibold'>{d.trades}</span> •
                    Win rate:{' '}
                    <span className='font-semibold'>
                      {formatPercent(d.winRate, 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className='border-t pt-3'>
            <div className='font-semibold'>Streaks</div>
            <div className='text-sm mt-2 space-y-1'>
              <div>
                Max consecutive wins:{' '}
                <span className='font-semibold'>
                  {stats.maxConsecutiveWins}
                </span>
              </div>
              <div>
                Avg consecutive wins:{' '}
                <span className='font-semibold'>
                  {formatNumber(stats.avgConsecutiveWins, 1)}
                </span>
              </div>
              <div className='mt-2'>
                Max consecutive losses:{' '}
                <span className='font-semibold'>
                  {stats.maxConsecutiveLosses}
                </span>
              </div>
              <div>
                Avg consecutive losses:{' '}
                <span className='font-semibold'>
                  {formatNumber(stats.avgConsecutiveLosses, 1)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className='border rounded-xl p-4 lg:col-span-2'>
          <div className='flex items-center justify-between gap-3'>
            <div className='font-semibold'>Best performing symbols</div>
            <div className='text-xs opacity-70'>Top / Bottom by net PnL</div>
          </div>

          <div className='mt-3 grid grid-cols-1 md:grid-cols-2 gap-3'>
            <div className='border rounded-lg p-3'>
              <div className='font-semibold text-sm'>Winners</div>
              <div className='mt-2 space-y-2 text-sm'>
                {topSymbols.length ? (
                  topSymbols.map((s) => (
                    <div
                      key={s.symbol}
                      className='flex items-center justify-between'>
                      <div className='font-semibold'>{s.symbol}</div>
                      <div className={cx('font-semibold', signColor(s.pnl))}>
                        {formatMoney(s.pnl, currency)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className='text-sm opacity-70'>No data.</div>
                )}
              </div>
            </div>

            <div className='border rounded-lg p-3'>
              <div className='font-semibold text-sm'>Losers</div>
              <div className='mt-2 space-y-2 text-sm'>
                {bottomSymbols.length ? (
                  bottomSymbols.map((s) => (
                    <div
                      key={s.symbol}
                      className='flex items-center justify-between'>
                      <div className='font-semibold'>{s.symbol}</div>
                      <div className={cx('font-semibold', signColor(s.pnl))}>
                        {formatMoney(s.pnl, currency)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className='text-sm opacity-70'>No data.</div>
                )}
              </div>
            </div>
          </div>

          <div className='mt-3 text-xs opacity-70'>
            Use the Instrument filter above to drill into one symbol.
          </div>
        </div>
      </section>

      {/* Calendar */}
      <section className='border rounded-xl p-4 space-y-3'>
        <div className='flex items-center justify-between gap-3 flex-wrap'>
          <div className='font-semibold'>Performance calendar</div>

          <div className='flex gap-2 items-center'>
            <input
              className='border rounded-lg p-2'
              type='month'
              value={calendarMonth}
              onChange={(e) => setCalendarMonth(e.target.value)}
            />
            <select
              className='border rounded-lg p-2'
              value={calendarMode}
              onChange={(e) =>
                setCalendarMode(e.target.value as 'PNL_PERCENT' | 'PNL_DOLLAR')
              }>
              <option value='PNL_PERCENT'>Daily PnL %</option>
              <option value='PNL_DOLLAR'>Daily Net PnL ($)</option>
            </select>
          </div>
        </div>

        <CalendarHeatmap
          title='Calendar view'
          month={calendarMonth}
          valueByDay={calendarValueByDay}
          modeLabel={
            calendarMode === 'PNL_PERCENT'
              ? 'Daily PnL % (sum)'
              : 'Daily Net PnL ($)'
          }
          valueFormatter={(n) =>
            calendarMode === 'PNL_PERCENT'
              ? formatPercent(n, 2)
              : formatMoney(n, currency)
          }
        />
      </section>

      {/* Quick table */}
      <section className='border rounded-xl p-4'>
        <div className='flex items-center justify-between gap-3'>
          <div className='font-semibold'>Trades (filtered)</div>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </div>

        <div className='overflow-auto mt-3'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-left border-b'>
                <th className='p-2'>Date</th>
                <th className='p-2'>Instrument</th>
                <th className='p-2'>Dir</th>
                <th className='p-2'>Session</th>
                <th className='p-2'>Outcome</th>
                <th className='p-2'>Net PnL</th>
                <th className='p-2'>PnL (%)</th>
                <th className='p-2'>Reviewed</th>
                <th className='p-2'>Setup</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((t) => {
                const net = calcNetPnl(t);
                const pct = Number(t.pnl_percent || 0);
                const setupName =
                  t.template_id === null
                    ? '—'
                    : setupTemplates.find((s) => s.id === t.template_id)
                        ?.name || 'Unknown';
                return (
                  <tr key={t.id} className='border-b'>
                    <td className='p-2'>
                      {new Date(t.opened_at).toLocaleString()}
                    </td>
                    <td className='p-2'>{t.instrument}</td>
                    <td className='p-2'>{t.direction}</td>
                    <td className='p-2'>{sessionLabel(getSessionUTC(t.opened_at))}</td>
                    <td className='p-2'>{t.outcome}</td>
                    <td className={cx('p-2 font-medium', signColor(net))}>
                      {formatMoney(net, currency)}
                    </td>
                    <td className={cx('p-2 font-medium', signColor(pct))}>
                      {formatPercent(pct, 2)}
                    </td>
                    <td className='p-2'>{t.reviewed_at ? 'Yes' : 'No'}</td>
                    <td className='p-2'>{setupName}</td>
                  </tr>
                );
              })}

              {!filteredTrades.length && (
                <tr>
                  <td colSpan={9} className='p-2 opacity-70'>
                    No trades for selected filters.
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

function Card({
  title,
  value,
  valueClassName,
}: {
  title: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className='border rounded-xl p-4'>
      <div className='text-sm opacity-70'>{title}</div>
      <div className={cx('text-xl font-semibold', valueClassName)}>{value}</div>
    </div>
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