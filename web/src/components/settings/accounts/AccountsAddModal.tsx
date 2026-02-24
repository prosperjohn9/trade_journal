'use client';

import { Modal } from '@/src/components/ui/Modal';
import type { useAccounts } from '@/src/hooks/useAccounts';

type AccountsState = Pick<
  ReturnType<typeof useAccounts>,
  | 'showAdd'
  | 'closeAdd'
  | 'addMsg'
  | 'addName'
  | 'setAddName'
  | 'addStartingBalance'
  | 'setAddStartingBalance'
  | 'addCurrency'
  | 'setAddCurrency'
  | 'creating'
  | 'onAddAccount'
>;

export function AccountsAddModal({ state: s }: { state: AccountsState }) {
  return (
    <Modal open={s.showAdd} title='Add account' onClose={s.closeAdd}>
      <div className='space-y-3'>
        {s.addMsg && <div className='text-sm text-rose-700'>{s.addMsg}</div>}

        <label className='block space-y-1'>
          <div className='text-sm opacity-70'>Name</div>
          <input
            className='w-full border rounded-lg p-3'
            value={s.addName}
            onChange={(e) => s.setAddName(e.target.value)}
            placeholder='e.g., FTMO, Personal, Prop, etc.'
          />
        </label>

        <label className='block space-y-1'>
          <div className='text-sm opacity-70'>Starting Balance</div>
          <input
            className='w-full border rounded-lg p-3'
            type='number'
            step='0.01'
            value={s.addStartingBalance}
            onChange={(e) => s.setAddStartingBalance(e.target.value)}
            placeholder='e.g., 100000'
          />
        </label>

        <label className='block space-y-1'>
          <div className='text-sm opacity-70'>Currency (optional)</div>
          <input
            className='w-full border rounded-lg p-3'
            value={s.addCurrency}
            onChange={(e) => s.setAddCurrency(e.target.value)}
            placeholder='e.g., USD'
          />
          <div className='text-xs opacity-60'>
            Leave empty to use USD display formatting.
          </div>
        </label>

        <div className='flex justify-end gap-2 pt-2'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={s.closeAdd}
            disabled={s.creating}>
            Cancel
          </button>

          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={s.onAddAccount}
            disabled={s.creating}>
            {s.creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
}