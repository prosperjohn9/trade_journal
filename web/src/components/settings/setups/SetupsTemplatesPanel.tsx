'use client';

import type { SetupsState } from '@/src/hooks/useSetups';

export function SetupsTemplatesPanel({
  state: s,
}: {
  state: Pick<
    SetupsState,
    | 'templates'
    | 'selectedTemplateId'
    | 'setSelectedTemplateId'
    | 'selectedTemplate'
    | 'isRenamingTemplate'
    | 'renameTemplateValue'
    | 'setRenameTemplateValue'
    | 'startRenameTemplate'
    | 'cancelRenameTemplate'
    | 'saveRenameTemplate'
    | 'setDefaultTemplate'
    | 'requestDeleteTemplate'
    | 'editingItemId'
    | 'isAnyEditing'
  >;
}) {
  return (
    <section className='border rounded-xl p-4 space-y-3 max-w-3xl'>
      <div className='flex items-center justify-between gap-3'>
        <h2 className='font-semibold'>Your Templates</h2>

        {s.selectedTemplate && (
          <div className='flex flex-wrap gap-2'>
            {!s.isRenamingTemplate ? (
              <>
                <button
                  className='border rounded-lg px-3 py-2 disabled:opacity-60'
                  onClick={s.startRenameTemplate}
                  disabled={s.isAnyEditing}>
                  Rename
                </button>

                <button
                  className='border rounded-lg px-3 py-2 disabled:opacity-60'
                  onClick={() => s.setDefaultTemplate(s.selectedTemplate!.id)}
                  disabled={s.isAnyEditing}>
                  Set Default
                </button>

                <button
                  className='border rounded-lg px-3 py-2 disabled:opacity-60'
                  onClick={s.requestDeleteTemplate}
                  disabled={s.isAnyEditing}>
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  className='border rounded-lg px-3 py-2 disabled:opacity-60'
                  onClick={() => s.saveRenameTemplate(s.selectedTemplate!.id)}
                  disabled={s.editingItemId !== null}>
                  Save
                </button>
                <button
                  className='border rounded-lg px-3 py-2 disabled:opacity-60'
                  onClick={s.cancelRenameTemplate}
                  disabled={s.editingItemId !== null}>
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <select
        className='border rounded-lg p-3 w-full'
        value={s.selectedTemplateId}
        onChange={(e) => s.setSelectedTemplateId(e.target.value)}
        disabled={s.isAnyEditing}>
        {!s.templates.length && <option value=''>No templates yet</option>}
        {s.templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.is_default ? ' (default)' : ''}
          </option>
        ))}
      </select>

      {s.selectedTemplate && s.isRenamingTemplate && (
        <div className='flex flex-wrap gap-2'>
          <input
            className='border rounded-lg p-3 flex-1 min-w-[260px]'
            value={s.renameTemplateValue}
            onChange={(e) => s.setRenameTemplateValue(e.target.value)}
            placeholder='New template name'
            disabled={s.editingItemId !== null}
          />
        </div>
      )}
    </section>
  );
}