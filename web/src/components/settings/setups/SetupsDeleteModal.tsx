'use client';

import { Modal } from '@/src/components/ui/Modal';
import type { SetupsState } from '@/src/hooks/useSetups';

export function SetupsDeleteModal({
  state: s,
}: {
  state: Pick<
    SetupsState,
    'deleteTarget' | 'deleting' | 'closeDelete' | 'confirmDelete'
  >;
}) {
  const title =
    s.deleteTarget?.kind === 'template'
      ? 'Delete setup template?'
      : 'Delete checklist item?';

  const body =
    s.deleteTarget?.kind === 'template'
      ? `This will delete "${s.deleteTarget.template.name}" and all its items. This cannot be undone.`
      : s.deleteTarget?.kind === 'item'
        ? `This will delete "${s.deleteTarget.item.label}". This cannot be undone.`
        : '';

  return (
    <Modal open={!!s.deleteTarget} title={title} onClose={s.closeDelete}>
      <p className='text-sm opacity-80'>{body}</p>

      <div className='mt-4 flex gap-2 justify-end'>
        <button
          className='border rounded-lg px-4 py-2 disabled:opacity-60'
          onClick={s.closeDelete}
          disabled={s.deleting}>
          Cancel
        </button>
        <button
          className='border rounded-lg px-4 py-2 disabled:opacity-60'
          onClick={s.confirmDelete}
          disabled={s.deleting}>
          {s.deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}