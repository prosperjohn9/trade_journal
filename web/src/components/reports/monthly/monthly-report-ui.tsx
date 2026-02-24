'use client';

export function Card({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode;
}) {
  return (
    <div className='border rounded-xl p-4'>
      <div className='text-sm opacity-70'>{title}</div>
      <div className='text-xl font-semibold'>{value}</div>
    </div>
  );
}

export function LineChart({
  values,
  labels,
}: {
  values: number[];
  labels: string[];
}) {
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