'use client';

import { useAccounts } from '@/src/hooks/useAccounts';
import { AccountsHeader } from './AccountsHeader';
import { AccountsTable } from './AccountsTable';
import { AccountsAddModal } from './AccountsAddModal';
import { AccountsEditModal } from './AccountsEditModal';
import { AccountsDeleteModal } from './AccountsDeleteModal';

export function AccountsClient() {
  const s = useAccounts();

  return (
    <main className='p-6 space-y-6'>
      <AccountsHeader state={s} />

      {s.pageMsg && <div className='text-sm text-rose-700'>{s.pageMsg}</div>}
      {s.loading && <div className='text-sm opacity-80'>Loading…</div>}

      {!s.loading && <AccountsTable state={s} />}

      <AccountsAddModal state={s} />
      <AccountsEditModal state={s} />
      <AccountsDeleteModal state={s} />
    </main>
  );
}