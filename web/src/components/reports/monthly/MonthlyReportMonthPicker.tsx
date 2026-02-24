'use client';

import type { MonthlyReportState } from '@/src/hooks/useMonthlyReport';

export function MonthlyReportMonthPicker({
  state: s,
}: {
  state: MonthlyReportState;
}) {
  return (
    <section className='flex flex-col md:flex-row md:items-center gap-3'>
      <div className='flex items-center gap-3'>
        <label className='text-sm opacity-80'>Account:</label>
        <select
          className='border rounded-lg p-2'
          value={s.accountId}
          onChange={(e) => s.setAccountId(e.target.value as 'all' | string)}
          disabled={!s.accounts.length}
          aria-label='Account selector'>
          <option value='all'>All accounts</option>
          {s.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className='flex items-center gap-3'>
        <label className='text-sm opacity-80'>Month:</label>
        <input
          className='border rounded-lg p-2'
          type='month'
          value={s.month}
          onChange={(e) => s.setMonth(e.target.value)}
        />
      </div>
    </section>
  );
}