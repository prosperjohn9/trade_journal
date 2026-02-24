'use client';

import type { SetupsState } from '@/src/hooks/useSetups';

export function SetupsCreateTemplate({
  state: s,
}: {
  state: Pick<
    SetupsState,
    'newTemplateName' | 'setNewTemplateName' | 'createTemplate' | 'isAnyEditing'
  >;
}) {
  return (
    <section className='border rounded-xl p-4 space-y-3 max-w-3xl'>
      <h2 className='font-semibold'>Create Setup Template</h2>
      <div className='flex flex-wrap gap-2'>
        <input
          className='border rounded-lg p-3 flex-1 min-w-[260px]'
          placeholder='e.g., London Breakout'
          value={s.newTemplateName}
          onChange={(e) => s.setNewTemplateName(e.target.value)}
          disabled={s.isAnyEditing}
        />
        <button
          className='border rounded-lg px-4 py-2 disabled:opacity-60'
          onClick={s.createTemplate}
          disabled={s.isAnyEditing}>
          Create
        </button>
      </div>
    </section>
  );
}