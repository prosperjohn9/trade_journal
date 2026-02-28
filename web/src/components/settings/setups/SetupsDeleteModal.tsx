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
      ? 'Delete Template?'
      : 'Delete checklist item?';

  const body =
    s.deleteTarget?.kind === 'template'
      ? 'This will remove all associated checklist rules. This cannot be undone.'
      : s.deleteTarget?.kind === 'item'
        ? `This will delete "${s.deleteTarget.item.label}". This cannot be undone.`
        : '';

  return (
    <Modal open={!!s.deleteTarget} title={title} onClose={s.closeDelete}>
      <p className='text-sm text-[var(--text-secondary)]'>{body}</p>

      <div className='mt-4 flex justify-end gap-2'>
        <button
          className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'
          onClick={s.closeDelete}
          disabled={s.deleting}>
          Cancel
        </button>
        <button
          className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--loss)] transition-colors hover:bg-[var(--loss-soft)] disabled:opacity-60'
          onClick={s.confirmDelete}
          disabled={s.deleting}>
          {s.deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}