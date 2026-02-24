import type { Outcome } from '@/src/lib/analytics/core';

export function formatNumber(amount: number, maxDigits = 2): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: maxDigits,
  }).format(amount);
}

export function formatPercent(amount: number, maxDigits = 2): string {
  return `${formatNumber(amount, maxDigits)}%`;
}

export function signColor(n: number): string {
  if (n > 0) return 'text-emerald-600';
  if (n < 0) return 'text-rose-600';
  return 'text-slate-700';
}

export function badgeClasses(outcome: Outcome): string {
  switch (outcome) {
    case 'WIN':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'LOSS':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export function reviewedBadge(reviewedAt: string | null) {
  return reviewedAt ? (
    <span className='text-xs border rounded-full px-2 py-1 bg-slate-50'>
      Reviewed
    </span>
  ) : (
    <span className='text-xs border rounded-full px-2 py-1 bg-white'>
      Not reviewed
    </span>
  );
}