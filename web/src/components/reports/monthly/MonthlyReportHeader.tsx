'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-').map((v) => Number(v));
  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
    return 'Monthly Report';
  }

  const d = new Date(year, monthNum - 1, 1);
  if (Number.isNaN(d.getTime())) return 'Monthly Report';

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

type State = Pick<
  MonthlyReportState,
  'month' | 'setMonth' | 'accountId' | 'setAccountId' | 'accounts' | 'selectedAccount'
>;

export function MonthlyReportHeader({ state: s }: { state: State }) {
  const router = useRouter();

  const subtitle = useMemo(() => {
    const monthLabel = formatMonthLabel(s.month);
    const accountLabel = s.selectedAccount?.name ?? 'All Accounts';
    return `${monthLabel} • ${accountLabel}`;
  }, [s.month, s.selectedAccount?.name]);

  return (
    <header className='space-y-5'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <h1 className='text-[2rem] font-semibold tracking-tight text-[var(--text-primary)]'>
            Monthly Report
          </h1>
          <p className='mt-1 text-sm text-[var(--text-secondary)]'>{subtitle}</p>
        </div>

        <div className='flex flex-wrap items-end gap-3 lg:justify-end'>
          <label className='text-xs font-medium text-[var(--text-secondary)]'>
            <span className='mb-1 block'>Account</span>
            <select
              className='min-w-[190px] rounded-lg border border-[var(--report-border)] bg-[var(--surface-elevated)] p-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
              value={s.accountId}
              onChange={(e) => s.setAccountId(e.target.value as 'all' | string)}
              disabled={!s.accounts.length}
              aria-label='Account selector'>
              <option value='all'>All Accounts</option>
              {s.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className='text-xs font-medium text-[var(--text-secondary)]'>
            <span className='mb-1 block'>Month</span>
            <input
              className='rounded-lg border border-[var(--report-border)] bg-[var(--surface-elevated)] p-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
              type='month'
              value={s.month}
              onChange={(e) => s.setMonth(e.target.value)}
            />
          </label>

          <button
            className='rounded-lg px-1 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'
            onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </div>
      </div>
    </header>
  );
}