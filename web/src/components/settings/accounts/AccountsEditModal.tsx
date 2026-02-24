'use client';

import { Modal } from '@/src/components/ui/Modal';
import type { useAccounts } from '@/src/hooks/useAccounts';

type AccountsState = Pick<
  ReturnType<typeof useAccounts>,
  | 'editing'
  | 'closeEdit'
  | 'editMsg'
  | 'editName'
  | 'setEditName'
  | 'editStartingBalance'
  | 'setEditStartingBalance'
  | 'editCurrency'
  | 'setEditCurrency'
  | 'saving'
  | 'onSaveEdit'
>;

export function AccountsEditModal({ state: s }: { state: AccountsState }) {
  return (
    <Modal open={!!s.editing} title='Edit account' onClose={s.closeEdit}>
      {s.editing && (
        <div className='space-y-3'>
          {s.editMsg && (
            <div className='text-sm text-rose-700'>{s.editMsg}</div>
          )}

          <label className='block space-y-1'>
            <div className='text-sm opacity-70'>Name</div>
            <input
              className='w-full border rounded-lg p-3'
              value={s.editName}
              onChange={(e) => s.setEditName(e.target.value)}
            />
          </label>

          <label className='block space-y-1'>
            <div className='text-sm opacity-70'>Starting Balance</div>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={s.editStartingBalance}
              onChange={(e) => s.setEditStartingBalance(e.target.value)}
            />
          </label>

          <label className='block space-y-1'>
            <div className='text-sm opacity-70'>Currency (optional)</div>
            <input
              className='w-full border rounded-lg p-3'
              value={s.editCurrency}
              onChange={(e) => s.setEditCurrency(e.target.value)}
              placeholder='e.g., USD'
            />
          </label>

          <div className='flex justify-end gap-2 pt-2'>
            <button
              className='border rounded-lg px-4 py-2'
              onClick={s.closeEdit}
              disabled={s.saving}>
              Cancel
            </button>

            <button
              className='border rounded-lg px-4 py-2 disabled:opacity-60'
              onClick={s.onSaveEdit}
              disabled={s.saving}>
              {s.saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}