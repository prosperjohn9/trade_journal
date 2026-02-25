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
  if (n > 0) return 'text-[var(--profit)]';
  if (n < 0) return 'text-[var(--loss)]';
  return 'text-[var(--text-primary)]';
}

export function badgeClasses(outcome: Outcome): string {
  switch (outcome) {
    case 'WIN':
      return 'border-transparent bg-[var(--profit-soft)] text-[var(--profit)]';
    case 'LOSS':
      return 'border-transparent bg-[var(--loss-soft)] text-[var(--loss)]';
    default:
      return 'border-transparent bg-[var(--neutral-badge)] text-[var(--neutral-text)]';
  }
}

export function reviewedBadge(reviewedAt: string | null) {
  if (reviewedAt) {
    return (
      <span className='inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--neutral-badge)] px-2 py-1 text-xs text-[var(--neutral-text)]'>
        <span aria-hidden='true'>●</span>
        Reviewed
      </span>
    );
  }

  return (
    <span className='inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-muted)]'>
      <span aria-hidden='true'>○</span>
      Pending
    </span>
  );
}
