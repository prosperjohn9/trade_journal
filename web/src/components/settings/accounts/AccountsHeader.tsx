'use client';

import { useRouter } from 'next/navigation';
import type { useAccounts } from '@/src/hooks/useAccounts';
import { ConnectBrokerButton } from './ConnectBrokerButton';
import { ConnectCtraderButton } from './ConnectCtraderButton';

type AccountsState = Pick<
  ReturnType<typeof useAccounts>,
  'openAdd' | 'reload'
>;

export function AccountsHeader({ state: s }: { state: AccountsState }) {
  const router = useRouter();

  return (
    <header className='flex flex-col gap-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 md:flex-row md:items-start md:justify-between'>
      <div>
        <h1 className='text-[2rem] font-semibold tracking-tight text-[var(--text-primary)]'>
          Accounts
        </h1>
        <p className='mt-1 text-sm text-[var(--text-secondary)]'>
          Manage and organize your trading capital.
        </p>
      </div>

      <div className='flex flex-wrap gap-2 md:justify-end'>
        <button
          className='rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
          onClick={() => router.push('/settings')}>
          Back
        </button>

        <ConnectBrokerButton onCreated={s.reload} />

        <ConnectCtraderButton />

        <button
          className='rounded-lg border border-transparent bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110'
          onClick={s.openAdd}>
          Add Account
        </button>
      </div>
    </header>
  );
}