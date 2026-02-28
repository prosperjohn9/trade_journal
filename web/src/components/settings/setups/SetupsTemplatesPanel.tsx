'use client';

import { cx } from '@/src/lib/utils/ui';
import type { SetupsState, Template } from '@/src/hooks/useSetups';

function TemplateDefaultBadge() {
  return (
    <span className='rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em] text-[var(--accent)]'>
      Default
    </span>
  );
}

function TemplateActions({
  template,
  isRenaming,
  isAnyEditing,
  renameValue,
  setRenameValue,
  startRename,
  saveRename,
  cancelRename,
  setDefault,
  requestDelete,
}: {
  template: Template;
  isRenaming: boolean;
  isAnyEditing: boolean;
  renameValue: string;
  setRenameValue: (next: string) => void;
  startRename: () => void;
  saveRename: (templateId: string) => void;
  cancelRename: () => void;
  setDefault: (templateId: string) => void;
  requestDelete: () => void;
}) {
  if (!isRenaming) {
    return (
      <div className='mt-2 flex flex-wrap items-center gap-2 text-sm'>
        <button
          className='rounded-md px-1.5 py-0.5 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60'
          onClick={startRename}
          disabled={isAnyEditing}>
          Rename
        </button>
        {!template.is_default && (
          <>
            <span className='text-[var(--text-muted)]'>•</span>
            <button
              className='rounded-md px-1.5 py-0.5 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60'
              onClick={() => setDefault(template.id)}
              disabled={isAnyEditing}>
              Set Default
            </button>
          </>
        )}
        <span className='text-[var(--text-muted)]'>•</span>
        <button
          className='rounded-md px-1.5 py-0.5 text-[var(--loss)] transition-opacity hover:opacity-85 disabled:opacity-60'
          onClick={requestDelete}
          disabled={isAnyEditing || template.is_default}
          title={
            template.is_default
              ? 'Set another template as default before deleting'
              : ''
          }>
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className='mt-3 space-y-2'>
      <input
        className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        placeholder='New template name'
        autoFocus
      />
      <div className='flex flex-wrap gap-2'>
        <button
          className='rounded-md border border-transparent bg-[var(--accent-cta)] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
          onClick={() => saveRename(template.id)}
          disabled={!renameValue.trim()}>
          Save
        </button>
        <button
          className='rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
          onClick={cancelRename}>
          Cancel
        </button>
      </div>
    </div>
  );
}

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
    | 'isAnyEditing'
  >;
}) {
  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
      <div className='mb-3 flex items-center justify-between gap-2'>
        <h2 className='text-base font-semibold text-[var(--text-primary)]'>Templates</h2>
        <span className='text-xs text-[var(--text-muted)]'>
          {s.templates.length} total
        </span>
      </div>

      {!s.templates.length ? (
        <div className='rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-4 text-sm text-[var(--text-muted)]'>
          No templates yet. Create one to start your setup library.
        </div>
      ) : (
        <ul className='space-y-2'>
          {s.templates.map((template) => {
            const selected = s.selectedTemplateId === template.id;
            const selectedAndRenaming = selected && s.isRenamingTemplate;

            return (
              <li
                key={template.id}
                className={cx(
                  'rounded-lg border p-3 transition-all duration-150',
                  selected
                    ? 'border-[var(--accent)] bg-[var(--accent-strip-bg)]'
                    : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] hover:shadow-[0_12px_24px_-20px_rgba(88,85,239,0.55)]',
                )}>
                <button
                  className='w-full text-left'
                  onClick={() => s.setSelectedTemplateId(template.id)}
                  disabled={s.isAnyEditing}>
                  <div className='flex items-center gap-2'>
                    <span
                      className={cx(
                        'inline-block h-2.5 w-2.5 rounded-full',
                        selected ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]',
                      )}
                    />
                    <span className='truncate text-sm font-medium text-[var(--text-primary)]'>
                      {template.name}
                    </span>
                    {template.is_default && <TemplateDefaultBadge />}
                  </div>
                </button>

                {selected && (
                  <TemplateActions
                    template={template}
                    isRenaming={selectedAndRenaming}
                    isAnyEditing={s.isAnyEditing}
                    renameValue={s.renameTemplateValue}
                    setRenameValue={s.setRenameTemplateValue}
                    startRename={s.startRenameTemplate}
                    saveRename={s.saveRenameTemplate}
                    cancelRename={s.cancelRenameTemplate}
                    setDefault={s.setDefaultTemplate}
                    requestDelete={s.requestDeleteTemplate}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
