'use client';

import { Modal } from '@/src/components/ui/Modal';
import type { useAccounts } from '@/src/hooks/useAccounts';

type AccountsState = Pick<
  ReturnType<typeof useAccounts>,
  'deleteTarget' | 'closeDelete' | 'deleteMsg' | 'deleting' | 'onConfirmDelete'
>;

export function AccountsDeleteModal({ state: s }: { state: AccountsState }) {
  return (
    <Modal
      open={!!s.deleteTarget}
      title='Delete account?'
      onClose={s.closeDelete}>
      {s.deleteTarget && (
        <div className='space-y-3'>
          {s.deleteMsg && (
            <div className='text-sm text-rose-700'>{s.deleteMsg}</div>
          )}

          <p className='text-sm opacity-80'>
            This will permanently delete{' '}
            <span className='font-semibold'>{s.deleteTarget.name}</span>.
          </p>

          <p className='text-xs opacity-70'>
            Note: You can only delete an account if it has{' '}
            <span className='font-semibold'>0 trades</span> and it’s not your
            last account.
          </p>

          <div className='flex justify-end gap-2 pt-2'>
            <button
              className='border rounded-lg px-4 py-2'
              onClick={s.closeDelete}
              disabled={s.deleting}>
              Cancel
            </button>

            <button
              className='border rounded-lg px-4 py-2 disabled:opacity-60'
              onClick={s.onConfirmDelete}
              disabled={s.deleting}>
              {s.deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}