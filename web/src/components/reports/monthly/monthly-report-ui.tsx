'use client';

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
  emphasized = false,
  compact = false,
  muted = false,
}: {
  title: string;
  value: React.ReactNode;
  valueClassName?: string;
  emphasized?: boolean;
  compact?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-xl border border-[var(--table-divider)]',
        muted ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface-elevated)]',
        compact ? 'min-h-[96px] p-4' : 'min-h-[114px] p-5',
      )}>
      <div className='text-sm text-[var(--text-secondary)]'>{title}</div>
      <div
        className={cx(
          'mt-2 tabular-nums leading-tight tracking-[-0.02em] text-[var(--text-primary)]',
          emphasized ? 'text-[2.45rem] font-bold' : 'text-[2rem] font-bold',
          compact && !emphasized && 'text-[1.8rem]',
          valueClassName,
        )}>
        {value}
      </div>
    </div>
  );
}

type ChartPoint = { x: number; y: number };

function smoothPath(points: ChartPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;

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

export function LineChart({
  values,
  labels,
  height = 280,
}: {
  values: number[];
  labels: string[];
  height?: number;
}) {
  const width = 1000;
  const padX = 20;
  const padY = 26;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = padX + (i * (width - padX * 2)) / Math.max(values.length - 1, 1);
    const y = padY + (1 - (v - min) / range) * (height - padY * 2);
    return { x, y };
  });

  const pathD = smoothPath(points);

  const gridLines = [0.2, 0.5, 0.8].map((ratio) => {
    const y = padY + ratio * (height - padY * 2);
    return { y, id: ratio };
  });

  return (
    <div className='w-full'>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className='block h-[280px] w-full md:h-[310px]'
        role='img'
        aria-label='Equity curve'>
        {gridLines.map((line) => (
          <line
            key={line.id}
            x1={padX}
            y1={line.y}
            x2={width - padX}
            y2={line.y}
            stroke='var(--chart-grid)'
            strokeWidth='1'
          />
        ))}

        <path d={pathD} fill='none' stroke='var(--chart-line)' strokeWidth='2' />

        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r='3.25'
            fill='var(--chart-point)'
          />
        )}
      </svg>

      <div className='mt-2 flex justify-between text-xs text-[var(--text-muted)]'>
        <span>{labels[0] ?? ''}</span>
        <span>{labels[labels.length - 1] ?? ''}</span>
      </div>
    </div>
  );
}
