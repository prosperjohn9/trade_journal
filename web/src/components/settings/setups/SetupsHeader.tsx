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
    <header className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5'>
      <div className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-[2.1rem] font-semibold tracking-tight text-[var(--text-primary)]'>
            Setups
          </h1>
          <p className='text-sm text-[var(--text-secondary)]'>
            Create your own entry criteria checklists. These appear as checkboxes
            when you add a trade.
          </p>
          {s.msg && <p className='text-sm text-[var(--text-muted)]'>{s.msg}</p>}
        </div>

        <div className='flex gap-2'>
          <button
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </header>
  );
}