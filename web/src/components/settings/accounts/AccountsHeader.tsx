'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { useAccounts } from '@/src/hooks/useAccounts';

type AccountsState = Pick<
  ReturnType<typeof useAccounts>,
  'accounts' | 'defaultAccountId' | 'openAdd'
>;

export function AccountsHeader({ state: s }: { state: AccountsState }) {
  const router = useRouter();

  const defaultName = useMemo(() => {
    if (!s.defaultAccountId) return null;
    return s.accounts.find((a) => a.id === s.defaultAccountId)?.name ?? null;
  }, [s.accounts, s.defaultAccountId]);

  return (
    <header className='flex items-start justify-between gap-4'>
      <div className='space-y-1'>
        <h1 className='text-2xl font-semibold'>Accounts</h1>
        <div className='text-sm opacity-80'>
          Manage your trading accounts. Every trade belongs to exactly one
          account.
        </div>

        {defaultName && (
          <div className='text-sm opacity-70'>
            Default account:{' '}
            <span className='font-semibold'>{defaultName}</span>
          </div>
        )}
      </div>

      <div className='flex gap-2'>
        <button
          className='border rounded-lg px-4 py-2'
          onClick={() => router.push('/dashboard')}>
          Back
        </button>

        <button className='border rounded-lg px-4 py-2' onClick={s.openAdd}>
          + Add Account
        </button>
      </div>
    </header>
  );
}