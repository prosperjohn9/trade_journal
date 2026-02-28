'use client';

import { useState } from 'react';
import { cx } from '@/src/lib/utils/ui';
import type { SetupsState } from '@/src/hooks/useSetups';

export function SetupsCreateTemplate({
  state: s,
}: {
  state: Pick<
    SetupsState,
    | 'newTemplateName'
    | 'setNewTemplateName'
    | 'newTemplateDescription'
    | 'setNewTemplateDescription'
    | 'createTemplate'
    | 'isAnyEditing'
  >;
}) {
  const [expanded, setExpanded] = useState(false);

  async function handleCreate() {
    const created = await s.createTemplate();
    if (created) setExpanded(false);
  }

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
      <div className='flex items-center justify-between gap-3'>
        <h2 className='text-base font-semibold text-[var(--text-primary)]'>
          Create Setup Template
        </h2>
        <button
          className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'
          onClick={() => setExpanded((prev) => !prev)}
          disabled={s.isAnyEditing}>
          {expanded ? 'Close' : 'New Template'}
        </button>
      </div>

      <div
        className={cx(
          'grid transition-all duration-300 ease-out',
          expanded
            ? 'mt-4 grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0',
        )}>
        <div className='overflow-hidden'>
          <div className='space-y-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
            <label className='block space-y-1'>
              <span className='text-sm font-medium text-[var(--text-secondary)]'>
                Template Name
              </span>
              <input
                className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
                placeholder='e.g., London Breakout'
                value={s.newTemplateName}
                onChange={(e) => s.setNewTemplateName(e.target.value)}
                disabled={s.isAnyEditing}
              />
            </label>

            <label className='block space-y-1'>
              <span className='text-sm font-medium text-[var(--text-secondary)]'>
                Description (optional)
              </span>
              <textarea
                className='min-h-20 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
                placeholder='e.g., HTF aligned continuation entries'
                value={s.newTemplateDescription}
                onChange={(e) => s.setNewTemplateDescription(e.target.value)}
                disabled={s.isAnyEditing}
              />
            </label>

            <div className='flex justify-end gap-2'>
              <button
                className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                onClick={() => setExpanded(false)}>
                Cancel
              </button>
              <button
                className='rounded-lg border border-transparent bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
                onClick={handleCreate}
                disabled={s.isAnyEditing || !s.newTemplateName.trim()}>
                Create
              </button>
            </div>
            <p className='text-xs text-[var(--text-muted)]'>
              Description is optional and currently used as planning context.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}