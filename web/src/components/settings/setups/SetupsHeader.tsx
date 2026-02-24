'use client';

import type { SetupsState } from '@/src/hooks/useSetups';

export function SetupsHeader({
  state: s,
  onBack,
}: {
  state: Pick<SetupsState, 'msg'>;
  onBack: () => void;
}) {
  return (
    <header className='flex items-start justify-between gap-4'>
      <div className='space-y-1'>
        <h1 className='text-2xl font-semibold'>Setups</h1>
        <p className='text-sm opacity-80'>
          Create your own entry criteria checklists. These appear as checkboxes
          when you add a trade.
        </p>
        {s.msg && <p className='text-sm opacity-80'>{s.msg}</p>}
      </div>

      <div className='flex gap-2'>
        <button className='border rounded-lg px-4 py-2' onClick={onBack}>
          Back
        </button>
      </div>
    </header>
  );
}