'use client';

import { useRouter } from 'next/navigation';

export function MonthlyReportHeader() {
  const router = useRouter();

  return (
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
  );
}