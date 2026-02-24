'use client';

import { useRef, useState } from 'react';
import {
  calcNetPnl,
  getSessionUTC,
  sessionLabel,
  type Filters,
  useAnalytics,
} from '@/src/hooks/useAnalytics';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
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

// Lightweight SVG charts.

type LinePoint = {
  xLabel: string;
  y: number;
  // Optional extra info per point (e.g., daily net, cumulative net)
  meta?: {
    dayNet?: number;
    cumNet?: number;
  };
};

function SvgLineChart({
  title,
  subtitle,
  points,
  height = 220,
  yFormatter,
  tooltipFormatter,
}: {
  title: string;
  subtitle?: string;
  points: Array<LinePoint>;
  height?: number;
  yFormatter: (y: number) => string;
  tooltipFormatter?: (p: LinePoint, index: number, all: Array<LinePoint>) => string;
}) {
  const width = 820;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<
    | {
        x: number;
        y: number;
        content: string;
      }
    | null
  >(null);

  const setHoverFromEvent = (e: React.MouseEvent, content: string) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHover({ x, y, content });
  };

  // Padding tuned to prevent Y-axis value labels (which can be long) from colliding with X-axis date labels.
  const padL = 96; // left space for money labels (supports large values)
  const padR = 24;
  const padT = 24;
  const padB = 44; // extra bottom space for dates

  if (!points.length) {
    return (
      <div className='border rounded-xl p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <div className='font-semibold'>{title}</div>
            {subtitle && <div className='text-xs opacity-70'>{subtitle}</div>}
          </div>
          <div className='text-xs opacity-70'>—</div>
        </div>

        <div className='mt-6 border rounded-lg p-6 text-center text-sm opacity-70 bg-slate-50'>
          No data for selected filters.
        </div>
      </div>
    );
  }

  const ys = points.map((p) => p.y);
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;
  const range = maxY - minY || 1;

  const xStep =
    points.length > 1 ? (width - padL - padR) / (points.length - 1) : 0;
  const toX = (i: number) => padL + i * xStep;
  const toY = (y: number) =>
    padT + (height - padT - padB) * (1 - (y - minY) / range);

  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(2)} ${toY(p.y).toFixed(2)}`
    )
    .join(' ');

  const y0 = toY(0);
  const axisY = clamp(y0, padT, height - padB);

  const ticks = 4;
  const tickVals = Array.from(
    { length: ticks + 1 },
    (_, i) => minY + (range * i) / ticks
  );

  return (
    <div className='border rounded-xl p-4 relative'>
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

      {hover && (
        <div
          className='pointer-events-none absolute z-10 rounded-lg border bg-white px-3 py-2 text-xs shadow-sm'
          style={{
            left: Math.max(8, Math.min(hover.x + 12, width - 220)),
            top: Math.max(8, Math.min(hover.y + 12, height - 80)),
            whiteSpace: 'pre-line',
          }}>
          {hover.content}
        </div>
      )}

      <div className='mt-3 w-full overflow-x-auto'>
        <svg
          ref={svgRef}
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
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke='rgba(0,0,0,0.08)'
                />
                <text x={10} y={y + 4} fontSize='10' fill='rgba(0,0,0,0.55)'>
                  {yFormatter(v)}
                </text>
              </g>
            );
          })}

          <line
            x1={padL}
            y1={axisY}
            x2={width - padR}
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

          {points.map((p, i) => {
            const tip = tooltipFormatter
              ? tooltipFormatter(p, i, points)
              : `${p.xLabel}: ${yFormatter(p.y)}`;

            return (
              <g key={i}>
                {/* Invisible larger target to make hovering easier */}
                <circle
                  cx={toX(i)}
                  cy={toY(p.y)}
                  r='10'
                  fill='transparent'
                  style={{ pointerEvents: 'all' }}
                  onMouseEnter={(e) => setHoverFromEvent(e, tip)}
                  onMouseMove={(e) => setHoverFromEvent(e, tip)}
                  onMouseLeave={() => setHover(null)}
                />

                {/* Visible dot */}
                <circle
                  cx={toX(i)}
                  cy={toY(p.y)}
                  r='2.5'
                  fill='currentColor'
                  className='text-slate-900'
                />
              </g>
            );
          })}

          {points.map((p, i) => {
            if (points.length > 20) {
              const step = Math.ceil(points.length / 10);
              if (i % step !== 0 && i !== points.length - 1) return null;
            }
            return (
              <text
                key={i}
                x={toX(i)}
                y={height - 12}
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

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<
    | {
        x: number;
        y: number;
        content: string;
      }
    | null
  >(null);

  const setHoverFromEvent = (e: React.MouseEvent, content: string) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHover({ x, y, content });
  };

  // Padding tuned to prevent Y-axis value labels from colliding with X-axis category labels.
  const padL = 96;
  const padR = 24;
  const padT = 24;
  const padB = 44;

  if (!bars.length) {
    return (
      <div className='border rounded-xl p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <div className='font-semibold'>{title}</div>
            {subtitle && <div className='text-xs opacity-70'>{subtitle}</div>}
          </div>
          <div className='text-xs opacity-70'>—</div>
        </div>

        <div className='mt-6 border rounded-lg p-6 text-center text-sm opacity-70 bg-slate-50'>
          No data for selected filters.
        </div>
      </div>
    );
  }

  const ys = bars.map((b) => b.y);
  const minY = ys.length ? Math.min(...ys, 0) : 0;
  const maxY = ys.length ? Math.max(...ys, 0) : 1;
  const range = maxY - minY || 1;

  const plotW = width - padL - padR;
  const barW = bars.length ? plotW / bars.length : plotW;
  const gap = Math.min(10, barW * 0.2);
  const innerW = Math.max(2, barW - gap);

  const toY = (y: number) =>
    padT + (height - padT - padB) * (1 - (y - minY) / range);
  const y0 = toY(0);

  const ticks = 4;
  const tickVals = Array.from(
    { length: ticks + 1 },
    (_, i) => minY + (range * i) / ticks
  );

  return (
    <div className='border rounded-xl p-4 relative'>
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

      {hover && (
        <div
          className='pointer-events-none absolute z-10 rounded-lg border bg-white px-3 py-2 text-xs shadow-sm'
          style={{
            left: Math.max(8, Math.min(hover.x + 12, width - 220)),
            top: Math.max(8, Math.min(hover.y + 12, height - 80)),
            whiteSpace: 'pre-line',
          }}>
          {hover.content}
        </div>
      )}

      <div className='mt-3 w-full overflow-x-auto'>
        <svg
          ref={svgRef}
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
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke='rgba(0,0,0,0.08)'
                />
                <text x={10} y={y + 4} fontSize='10' fill='rgba(0,0,0,0.55)'>
                  {yFormatter(v)}
                </text>
              </g>
            );
          })}

          <line
            x1={padL}
            y1={y0}
            x2={width - padR}
            y2={y0}
            stroke='rgba(0,0,0,0.18)'
          />

          {bars.map((b, i) => {
            const x = padL + i * barW + gap / 2;
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
                  onMouseEnter={(e) =>
                    setHoverFromEvent(
                      e,
                      `${xLabelFormatter ? xLabelFormatter(b.xLabel) : b.xLabel}: ${yFormatter(b.y)}`
                    )
                  }
                  onMouseMove={(e) =>
                    setHoverFromEvent(
                      e,
                      `${xLabelFormatter ? xLabelFormatter(b.xLabel) : b.xLabel}: ${yFormatter(b.y)}`
                    )
                  }
                  onMouseLeave={() => setHover(null)}
                />
                <text
                  x={x + innerW / 2}
                  y={height - 12}
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

export function AnalyticsClient() {
  const {
    loading,
    msg,
    currency,
    hasStartingBalance,
    startingBalance,

    draft,
    setDraft,
    showFilters,
    setShowFilters,

    accounts,
    setupTemplates,
    trades,
    filteredTrades,
    instrumentOptions,

    activeFilterCount,
    filtersSummary,
    hasUnsavedChanges,

    calendarMonth,
    setCalendarMonth,
    calendarMode,
    setCalendarMode,

    stats,
    equitySeries,
    dailyNetSeries,
    monthlyNetBars,
    monthlyAdvanced,
    dayOfWeekBars,
    hourBars,
    directionPerf,
    sessionPerf,
    sessionPnlBars,
    topSymbols,
    bottomSymbols,
    calendarValueByDay,
    sharpe,

    applyDraftFilters,
    clearFilters,
    goDashboard,
    logout,
  } = useAnalytics();

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
            onClick={goDashboard}>
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
              onClick={applyDraftFilters}>
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
              <Field label='Account'>
                <select
                  className='w-full border rounded-lg p-3'
                  value={draft.accountFilter}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      accountFilter: e.target.value,
                    }))
                  }>
                  <option value='all'>All accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.is_default ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </Field>

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
                  placeholder='Select or type…'
                  list='instrument-options'
                  value={draft.instrumentQuery}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, instrumentQuery: e.target.value }))
                  }
                />
                <datalist id='instrument-options'>
                  {instrumentOptions.map((sym) => (
                    <option key={sym} value={sym} />
                  ))}
                </datalist>
                <div className='mt-1 text-[11px] opacity-70'>
                  Suggestions are pulled from instruments in the loaded date range.
                </div>
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
                  onClick={clearFilters}>
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

      {/* Equity curve (full width, shown before KPIs) */}
      <section className='grid grid-cols-1 gap-3'>
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
          tooltipFormatter={(p) => {
            const dayNet = p.meta?.dayNet ?? 0;
            const cumNet = p.meta?.cumNet ?? 0;
            const equityLabel = hasStartingBalance
              ? `Equity: ${formatMoney(p.y, currency)}`
              : `Cum Net: ${formatMoney(p.y, currency)}`;

            const lines = [
              `Date: ${p.xLabel}`,
              equityLabel,
              `Day Net: ${formatMoney(dayNet, currency)}`,
            ];

            // When equity is shown, also show cumulative net PnL since start.
            if (hasStartingBalance) {
              lines.push(`Cum Net: ${formatMoney(cumNet, currency)}`);
            }

            return lines.join('\n');
          }}
        />
      </section>

      {/* Summary cards */}
      <section className='grid grid-cols-2 md:grid-cols-4 gap-3'>
        <Card
          title='Total Net PnL'
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
          title='Expectancy / Trade'
          value={formatMoney(stats.expectancy, currency)}
          valueClassName={signColor(stats.expectancy)}
        />

        <Card
          title='Sharpe Ratio (daily)'
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

      {/* Daily net */}
      <section className='grid grid-cols-1 gap-3'>
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

      <section className='border rounded-xl p-4'>
        <div className='flex items-center justify-between gap-3 flex-wrap'>
          <div>
            <div className='font-semibold'>Monthly advanced metrics</div>
            <div className='text-xs opacity-70 mt-1'>Win rate, expectancy, RRR, duration, activity</div>
          </div>
        </div>

        <div className='overflow-auto mt-3'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-left border-b'>
                <th className='p-2'>Month</th>
                <th className='p-2'>Trades</th>
                <th className='p-2'>Win %</th>
                <th className='p-2'>RRR</th>
                <th className='p-2'>Expectancy / Trade</th>
                <th className='p-2'>Avg Duration</th>
                <th className='p-2'>Active Days</th>
                <th className='p-2'>Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {monthlyAdvanced.map((m) => (
                <tr key={m.month} className='border-b'>
                  <td className='p-2 font-medium'>{m.month}</td>
                  <td className='p-2'>{m.trades}</td>
                  <td className='p-2'>{formatPercent(m.winRate, 0)}</td>
                  <td className='p-2'>
                    {m.rrr === Infinity
                      ? '∞'
                      : Number.isFinite(m.rrr)
                      ? formatNumber(m.rrr, 2)
                      : '—'}
                  </td>
                  <td className={cx('p-2 font-medium', signColor(m.expectancy))}>
                    {formatMoney(m.expectancy, currency)}
                  </td>
                  <td className='p-2'>
                    {m.avgDurationMin ? `${formatNumber(m.avgDurationMin, 0)} min` : '—'}
                  </td>
                  <td className='p-2'>{m.activeDays}</td>
                  <td className={cx('p-2 font-medium', signColor(m.pnl))}>
                    {formatMoney(m.pnl, currency)}
                  </td>
                </tr>
              ))}

              {!monthlyAdvanced.length && (
                <tr>
                  <td colSpan={8} className='p-2 opacity-70'>
                    No monthly data for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className='mt-3 text-xs opacity-70'>
          Avg duration uses only trades with <span className='font-semibold'>exit date/time</span>. Active Days counts distinct trade days.
        </div>
      </section>

      <section className='grid grid-cols-1 gap-3'>
        <SvgBarChart
          title='Performance by Time'
          subtitle='Net PnL by hour (based on trade entry date/time)'
          bars={hourBars}
          yFormatter={(y) => formatMoney(y, currency)}
        />
      </section>

      {/* Session performance */}
      <section className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
        <SvgBarChart
          title='Performance by Session (UTC)'
          subtitle='Net PnL by trading session'
          bars={sessionPnlBars}
          yFormatter={(y) => formatMoney(y, currency)}
        />

        <div className='border rounded-xl p-4'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <div className='font-semibold'>Session summary</div>
              <div className='text-xs opacity-70 mt-1'>Trades, win rate, and net PnL</div>
            </div>
          </div>

          <div className='mt-3 space-y-2 text-sm'>
            {sessionPerf.map((s) => (
              <div key={s.session} className='border rounded-lg p-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='font-semibold'>{sessionLabel(s.session)}</div>
                  <div className={cx('font-semibold', signColor(s.pnl))}>
                    {formatMoney(s.pnl, currency)}
                  </div>
                </div>
                <div className='text-xs opacity-70 mt-1'>
                  Trades: <span className='font-semibold'>{s.trades}</span> • Win rate:{' '}
                  <span className='font-semibold'>{formatPercent(s.winRate, 0)}</span> •
                  Wins: <span className='font-semibold'>{s.wins}</span> • Losses:{' '}
                  <span className='font-semibold'>{s.losses}</span> • BE:{' '}
                  <span className='font-semibold'>{s.be}</span>
                </div>
              </div>
            ))}

            {!sessionPerf.some((s) => s.trades > 0) && (
              <div className='text-sm opacity-70'>No data.</div>
            )}
          </div>

          <div className='mt-3 text-xs opacity-70'>
            Sessions are computed from <span className='font-semibold'>entry date/time</span> using UTC hours.
          </div>
        </div>
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
          <div className='border-t pt-3'>
            <div className='font-semibold'>Winners vs Losers</div>
            <div className='text-xs opacity-70 mt-1'>Counts, % stats, and average duration</div>

            <div className='mt-3 grid grid-cols-1 gap-3'>
              <div className='border rounded-xl p-4'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <div className='font-semibold'>Winners</div>
                    <div className='text-xs opacity-70 mt-1'>Best win %, Avg PnL %, Avg duration</div>
                  </div>
                  <div className='text-xs border rounded-full px-2 py-1 bg-emerald-50 border-emerald-200 text-emerald-900'>
                    {formatPercent(stats.winShare, 0)}
                  </div>
                </div>

                <div className='mt-4 grid grid-cols-2 gap-3 text-sm'>
                  <div className='border rounded-lg p-3'>
                    <div className='text-xs opacity-70'>Trades</div>
                    <div className='text-lg font-semibold'>{stats.winCount}</div>
                  </div>
                  <div className='border rounded-lg p-3'>
                    <div className='text-xs opacity-70'>Avg PnL %</div>
                    <div className={cx('text-lg font-semibold', signColor(stats.winPctAvg))}>
                      {formatPercent(stats.winPctAvg, 2)}
                    </div>
                  </div>

                  <div className='border rounded-lg p-3'>
                    <div className='text-xs opacity-70'>Best win %</div>
                    <div className='text-lg font-semibold text-emerald-700'>
                      {formatPercent(stats.bestWinPct, 2)}
                    </div>
                  </div>
                  <div className='border rounded-lg p-3'>
                    <div className='text-xs opacity-70'>Avg duration (wins)</div>
                    <div className='text-lg font-semibold'>
                      {stats.avgWinDurationMin ? `${formatNumber(stats.avgWinDurationMin, 0)} min` : '—'}
                    </div>
                  </div>
                </div>

                <div className='mt-3 text-xs opacity-70'>
                  Avg duration uses only trades with <span className='font-semibold'>exit date/time</span>.
                </div>
              </div>

              <div className='border rounded-xl p-4'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <div className='font-semibold'>Losers</div>
                    <div className='text-xs opacity-70 mt-1'>Worst loss %, Avg PnL %, Avg duration</div>
                  </div>
                  <div className='text-xs border rounded-full px-2 py-1 bg-rose-50 border-rose-200 text-rose-900'>
                    {formatPercent(stats.lossShare, 0)}
                  </div>
                </div>

                <div className='mt-4 grid grid-cols-2 gap-3 text-sm'>
                  <div className='border rounded-lg p-3'>
                    <div className='text-xs opacity-70'>Trades</div>
                    <div className='text-lg font-semibold'>{stats.lossCount}</div>
                  </div>
                  <div className='border rounded-lg p-3'>
                    <div className='text-xs opacity-70'>Avg PnL %</div>
                    <div className={cx('text-lg font-semibold', signColor(stats.lossPctAvg))}>
                      {formatPercent(stats.lossPctAvg, 2)}
                    </div>
                  </div>

                  <div className='border rounded-lg p-3'>
                    <div className='text-xs opacity-70'>Worst loss %</div>
                    <div className='text-lg font-semibold text-rose-700'>
                      {formatPercent(stats.worstLossPct, 2)}
                    </div>
                  </div>
                  <div className='border rounded-lg p-3'>
                    <div className='text-xs opacity-70'>Avg duration (losses)</div>
                    <div className='text-lg font-semibold'>
                      {stats.avgLossDurationMin ? `${formatNumber(stats.avgLossDurationMin, 0)} min` : '—'}
                    </div>
                  </div>
                </div>

                <div className='mt-3 text-xs opacity-70'>
                  Breakeven share: <span className='font-semibold'>{formatPercent(stats.beShare, 0)}</span>
                </div>
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
            onClick={goDashboard}>
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
