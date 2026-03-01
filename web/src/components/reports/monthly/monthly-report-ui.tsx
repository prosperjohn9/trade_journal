'use client';

import { useState } from 'react';
import { formatMoney } from '@/src/lib/utils/format';
import { cx } from '@/src/lib/utils/ui';

export function formatNumber(amount: number, maxDigits = 2): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: maxDigits,
  }).format(amount);
}

export function formatSignedPercent(amount: number, maxDigits = 2): string {
  const sign = amount > 0 ? '+' : '';
  return `${sign}${formatNumber(amount, maxDigits)}%`;
}

export function signValueClass(n: number): string {
  if (n > 0) return 'text-[var(--profit)]';
  if (n < 0) return 'text-[var(--loss)]';
  return 'text-[var(--text-primary)]';
}

export function volatilityLabel(returns: number[]): 'Low' | 'Moderate' | 'High' {
  if (!returns.length) return 'Low';

  const mean = returns.reduce((acc, value) => acc + value, 0) / returns.length;
  const variance =
    returns.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
    returns.length;
  const sigmaPct = Math.sqrt(variance) * 100;

  if (sigmaPct < 1) return 'Low';
  if (sigmaPct < 2.5) return 'Moderate';
  return 'High';
}

export function ReportMetricCard({
  title,
  value,
  valueClassName,
  caption,
  emphasized = false,
  compact = false,
  muted = false,
}: {
  title: string;
  value: React.ReactNode;
  valueClassName?: string;
  caption?: React.ReactNode;
  emphasized?: boolean;
  compact?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-xl border',
        muted
          ? 'border-[var(--report-divider)] bg-[var(--surface-muted)]'
          : 'border-[var(--report-border)] bg-[var(--surface-elevated)]',
        compact ? 'min-h-[82px] px-4 py-3.5' : 'min-h-[112px] p-5',
      )}>
      <div className='text-[13px] font-medium text-[var(--text-secondary)]'>
        {title}
      </div>
      <div
        className={cx(
          'mt-2 tabular-nums leading-tight tracking-[-0.02em] text-[var(--text-primary)]',
          emphasized ? 'text-[2.125rem] font-bold' : 'text-[1.625rem] font-bold',
          compact && !emphasized && 'text-[1.35rem]',
          valueClassName,
        )}>
        {value}
      </div>
      {caption ? (
        <div className='mt-1.5 text-[11px] font-medium text-[var(--text-muted)]'>
          {caption}
        </div>
      ) : null}
    </div>
  );
}

export type EquityChartPoint = {
  dayKey: string;
  xLabel: string;
  equity: number;
  dayNet: number;
  cumNet: number;
};

type CartesianPoint = {
  x: number;
  y: number;
  value: number;
};

type SignedSegment = {
  tone: 'profit' | 'loss';
  points: CartesianPoint[];
};

function smoothCurveCommands(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return '';

  let d = '';

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;

    const cp1x = prev.x + dx * 0.42;
    const cp1y = prev.y;
    const cp2x = prev.x + dx * 0.58;
    const cp2y = curr.y;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
  }

  return d;
}

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return `M ${points[0].x} ${points[0].y}${smoothCurveCommands(points)}`;
}

function splitByBaseline(
  points: CartesianPoint[],
  baselineValue: number,
): SignedSegment[] {
  if (points.length < 2) return [];

  const segments: SignedSegment[] = [];

  let currentTone: SignedSegment['tone'] =
    points[0].value >= baselineValue ? 'profit' : 'loss';
  let currentPoints: CartesianPoint[] = [points[0]];

  for (let i = 1; i < points.length; i += 1) {
    const p1 = currentPoints[currentPoints.length - 1];
    const p2 = points[i];

    const p1Above = p1.value >= baselineValue;
    const p2Above = p2.value >= baselineValue;

    if (p1Above === p2Above || p1.value === p2.value) {
      currentPoints.push(p2);
      continue;
    }

    const t = (baselineValue - p1.value) / (p2.value - p1.value);
    const crossingPoint: CartesianPoint = {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
      value: baselineValue,
    };

    currentPoints.push(crossingPoint);

    segments.push({
      tone: currentTone,
      points: currentPoints,
    });

    currentTone = p2Above ? 'profit' : 'loss';
    currentPoints = [crossingPoint, p2];
  }

  if (currentPoints.length > 1) {
    segments.push({ tone: currentTone, points: currentPoints });
  }

  return segments;
}

function areaPath(points: CartesianPoint[], baselineY: number): string {
  if (points.length < 2) return '';

  const first = points[0];
  const last = points[points.length - 1];
  const curve = smoothCurveCommands(points);

  return [
    `M ${first.x.toFixed(2)} ${baselineY.toFixed(2)}`,
    `L ${first.x.toFixed(2)} ${first.y.toFixed(2)}`,
    curve,
    `L ${last.x.toFixed(2)} ${baselineY.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function formatTooltipDateLabel(dayKey: string): string {
  if (dayKey === 'Start') return 'Start';

  const d = new Date(dayKey);
  if (Number.isNaN(d.getTime())) return dayKey;

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function tooltipMetricTone(n: number): string {
  if (n > 0) return 'text-[var(--profit)]';
  if (n < 0) return 'text-[var(--loss)]';
  return 'text-[var(--text-primary)]';
}

export function LineChart({
  points,
  startingBalance,
  currency,
  height = 300,
}: {
  points: EquityChartPoint[];
  startingBalance: number;
  currency: string;
  height?: number;
}) {
  const width = 1080;
  const padL = 112;
  const padR = 26;
  const padT = 20;
  const padB = 40;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!points.length) {
    return (
      <div className='rounded-xl border border-[var(--report-border)] bg-[var(--surface-elevated)] p-6 text-center text-sm text-[var(--text-secondary)]'>
        No equity data available.
      </div>
    );
  }

  const values = points.map((point) => point.equity);
  const min = Math.min(...values, startingBalance);
  const max = Math.max(...values, startingBalance);
  const range = max - min || Math.max(Math.abs(max) * 0.02, 1);

  const yPadding = Math.max(range * 0.18, Math.abs(startingBalance) * 0.006, 1);
  const domainMin = min - yPadding;
  const domainMax = max + yPadding;
  const domainRange = domainMax - domainMin || 1;

  const toX = (index: number) =>
    padL + (index * (width - padL - padR)) / Math.max(points.length - 1, 1);
  const toY = (value: number) =>
    padT + (1 - (value - domainMin) / domainRange) * (height - padT - padB);

  const cartesianPoints: CartesianPoint[] = points.map((point, index) => ({
    x: toX(index),
    y: toY(point.equity),
    value: point.equity,
  }));

  const baselineY = toY(startingBalance);
  const lineSegments = splitByBaseline(cartesianPoints, startingBalance);

  const ticks = 4;
  const baseTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = domainMin + (domainRange * i) / ticks;
    return Number(v.toFixed(2));
  });
  const tickValues = Array.from(
    new Set([...baseTicks, Number(startingBalance.toFixed(2))]),
  ).sort((a, b) => b - a);

  const currentIndex =
    selectedIndex === null
      ? points.length - 1
      : Math.min(selectedIndex, points.length - 1);
  const activePoint = points[currentIndex];
  const activeXY = cartesianPoints[currentIndex];
  const tooltipWidth = 236;
  const tooltipHeight = 130;
  const tooltipXBase =
    activeXY.x > width - tooltipWidth - 24
      ? activeXY.x - tooltipWidth - 14
      : activeXY.x + 14;
  const tooltipYBase =
    activeXY.y < tooltipHeight + 24
      ? activeXY.y + 14
      : activeXY.y - tooltipHeight - 14;
  const tooltipX = Math.max(8, Math.min(tooltipXBase, width - tooltipWidth - 8));
  const tooltipY = Math.max(
    8,
    Math.min(tooltipYBase, height - tooltipHeight - 8),
  );

  const labelStep =
    points.length > 14 ? Math.ceil((points.length - 1) / 10) : 1;

  return (
    <div className='relative w-full'>
      <div className='overflow-x-auto'>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className='block h-[300px] min-w-[760px] w-full md:h-[330px]'
          role='img'
          aria-label='Equity curve'>
          {tickValues.map((tick) => {
            const y = toY(tick);
            const isBaseline = Math.abs(tick - startingBalance) < 0.005;

            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke='var(--chart-grid)'
                  strokeDasharray={isBaseline ? '3 6' : '0'}
                  strokeWidth={isBaseline ? '1' : '1'}
                  opacity={isBaseline ? '0.48' : '0.58'}
                />
                <text
                  x={10}
                  y={y + 4}
                  fontSize='11'
                  fill='var(--text-muted)'
                  className='tabular-nums'>
                  {formatMoney(tick, currency)}
                </text>
              </g>
            );
          })}

          {lineSegments.map((segment, idx) => {
            const fillD = areaPath(segment.points, baselineY);
            const strokeD = smoothPath(segment.points);

            return (
              <g key={`${segment.tone}-${idx}`}>
                {fillD && (
                  <path
                    d={fillD}
                    fill={
                      segment.tone === 'profit'
                        ? 'var(--chart-profit-fill)'
                        : 'var(--chart-loss-fill)'
                    }
                    opacity='0.8'
                  />
                )}

                <path
                  d={strokeD}
                  fill='none'
                  stroke={
                    segment.tone === 'profit'
                      ? 'var(--chart-profit-line)'
                      : 'var(--chart-loss-line)'
                  }
                  strokeWidth='var(--chart-line-width)'
                  strokeLinecap='round'
                />
              </g>
            );
          })}

          <line
            x1={activeXY.x}
            y1={padT}
            x2={activeXY.x}
            y2={height - padB}
            stroke='var(--chart-grid)'
            strokeDasharray='4 4'
          />

          {cartesianPoints.map((point, index) => {
            const above = points[index].equity >= startingBalance;
            const isActive = index === currentIndex;

            return (
              <g key={`${points[index].dayKey}-${index}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r='10'
                  fill='transparent'
                  onMouseEnter={() => setSelectedIndex(index)}
                  onMouseMove={() => setSelectedIndex(index)}
                  onClick={() => setSelectedIndex(index)}
                  style={{ pointerEvents: 'all' }}
                />

                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? '5.6' : '3.2'}
                  fill={
                    above ? 'var(--chart-profit-line)' : 'var(--chart-loss-line)'
                  }
                  stroke='var(--surface-elevated)'
                  strokeWidth={isActive ? '2.2' : '1.4'}
                />
              </g>
            );
          })}

          {points.map((point, index) => {
            if (
              index !== 0 &&
              index !== points.length - 1 &&
              index % labelStep !== 0
            ) {
              return null;
            }

            return (
              <text
                key={`${point.dayKey}-x`}
                x={cartesianPoints[index].x}
                y={height - 10}
                fontSize='11'
                fill='var(--text-muted)'
                textAnchor='middle'>
                {point.xLabel}
              </text>
            );
          })}
        </svg>
      </div>

      <div
        className='pointer-events-none absolute z-20 min-w-[210px] rounded-xl border px-3 py-2 text-xs'
        style={{
          left: `${(tooltipX / width) * 100}%`,
          top: `${(tooltipY / height) * 100}%`,
          backgroundColor: 'var(--chart-tooltip-bg)',
          borderColor: 'var(--chart-tooltip-border)',
          color: 'var(--text-primary)',
          boxShadow: 'var(--chart-tooltip-shadow)',
        }}>
        <div className='font-semibold text-[var(--text-primary)]'>
          {formatTooltipDateLabel(activePoint.dayKey)}
        </div>

        <div className='mt-2 space-y-1.5'>
          <div className='flex items-center justify-between gap-3'>
            <span className='text-[var(--text-secondary)]'>Equity</span>
            <span className='font-semibold tabular-nums'>
              {formatMoney(activePoint.equity, currency)}
            </span>
          </div>

          <div className='flex items-center justify-between gap-3'>
            <span className='text-[var(--text-secondary)]'>Day Net</span>
            <span
              className={cx(
                'font-semibold tabular-nums',
                tooltipMetricTone(activePoint.dayNet),
              )}>
              {formatMoney(activePoint.dayNet, currency)}
            </span>
          </div>

          <div className='flex items-center justify-between gap-3'>
            <span className='text-[var(--text-secondary)]'>Cum Net</span>
            <span
              className={cx(
                'font-semibold tabular-nums',
                tooltipMetricTone(activePoint.cumNet),
              )}>
              {formatMoney(activePoint.cumNet, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
