'use client';

import { useState } from 'react';
import { cx } from '@/src/lib/utils/ui';
import type { Item, SetupsState } from '@/src/hooks/useSetups';

function ItemToggle({
  checked,
  onToggle,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type='button'
      className={cx(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-[var(--profit)]' : 'bg-[var(--neutral-badge)]',
        disabled ? 'opacity-60' : '',
      )}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={checked ? 'Disable item' : 'Enable item'}>
      <span
        className={cx(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

function RowButton({
  children,
  onClick,
  disabled,
  tone = 'neutral',
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'danger';
  title?: string;
}) {
  return (
    <button
      className={cx(
        'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
        tone === 'danger'
          ? 'border-[var(--border-default)] text-[var(--loss)] hover:bg-[var(--loss-soft)]'
          : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]',
      )}
      onClick={onClick}
      disabled={disabled}
      title={title}>
      {children}
    </button>
  );
}

function ItemRow({
  item,
  isEditing,
  isDropTarget,
  canDrag,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  state: s,
}: {
  item: Item;
  isEditing: boolean;
  isDropTarget: boolean;
  canDrag: boolean;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDragOver: (itemId: string) => void;
  onDrop: (itemId: string) => void;
  state: Pick<
    SetupsState,
    | 'isAnyEditing'
    | 'editingItemValue'
    | 'setEditingItemValue'
    | 'startEditItem'
    | 'cancelEditItem'
    | 'saveEditItem'
    | 'toggleItemActive'
    | 'requestDeleteItem'
  >;
}) {
  return (
    <li
      className={cx(
        'rounded-lg border bg-[var(--bg-surface)] px-3 py-2.5 transition-colors',
        isDropTarget
          ? 'border-[var(--accent)] bg-[var(--accent-strip-bg)]'
          : 'border-[var(--border-default)]',
      )}
      onDragOver={(e) => {
        if (!canDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(item.id);
      }}
      onDrop={(e) => {
        if (!canDrag) return;
        e.preventDefault();
        onDrop(item.id);
      }}>
      <div className='flex items-start gap-3'>
        <div
          draggable={canDrag}
          onDragStart={(e) => {
            if (!canDrag) return;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.id);
            onDragStart(item.id);
          }}
          onDragEnd={onDragEnd}
          className={cx(
            'mt-1 select-none text-base leading-none text-[var(--text-muted)]',
            canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          )}
          title={canDrag ? 'Drag to reorder' : 'Finish editing before reordering'}>
          ⋮⋮
        </div>

        <ItemToggle
          checked={item.is_active}
          onToggle={() => s.toggleItemActive(item)}
          disabled={s.isAnyEditing}
        />

        <div className='min-w-0 flex-1'>
          {!isEditing ? (
            <div className='pt-0.5 text-base text-[var(--text-primary)]'>
              {item.label}
            </div>
          ) : (
            <input
              className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
              value={s.editingItemValue}
              onChange={(e) => s.setEditingItemValue(e.target.value)}
              autoFocus
            />
          )}
        </div>

        {!isEditing ? (
          <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
            <RowButton onClick={() => s.startEditItem(item)} disabled={s.isAnyEditing}>
              Edit
            </RowButton>
            <RowButton
              onClick={() => s.requestDeleteItem(item)}
              disabled={s.isAnyEditing}
              tone='danger'>
              Delete
            </RowButton>
          </div>
        ) : (
          <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
            <RowButton
              onClick={() => s.saveEditItem(item)}
              disabled={!s.editingItemValue.trim()}>
              Save
            </RowButton>
            <RowButton onClick={s.cancelEditItem}>Cancel</RowButton>
          </div>
        )}
      </div>
    </li>
  );
}

export function SetupsItemsPanel({
  state: s,
}: {
  state: Pick<
    SetupsState,
    | 'selectedTemplate'
    | 'selectedTemplateId'
    | 'items'
    | 'newItemLabel'
    | 'setNewItemLabel'
    | 'addItem'
    | 'isAnyEditing'
    | 'editingItemId'
    | 'editingItemValue'
    | 'setEditingItemValue'
    | 'startEditItem'
    | 'cancelEditItem'
    | 'saveEditItem'
    | 'toggleItemActive'
    | 'requestDeleteItem'
    | 'reorderItems'
  >;
}) {
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const canDrag = !s.isAnyEditing && s.items.length > 1;

  function onDrop(targetItemId: string) {
    if (!draggingItemId || draggingItemId === targetItemId) {
      setDragOverItemId(null);
      return;
    }

    const fromIndex = s.items.findIndex((item) => item.id === draggingItemId);
    const toIndex = s.items.findIndex((item) => item.id === targetItemId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingItemId(null);
      setDragOverItemId(null);
      return;
    }

    const next = [...s.items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    setDraggingItemId(null);
    setDragOverItemId(null);
    void s.reorderItems(next.map((item) => item.id));
  }

  const items = s.items;

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5'>
      <div className='space-y-1'>
        <h2 className='text-xl font-semibold text-[var(--text-primary)]'>Checklist Items</h2>
        <p className='text-sm text-[var(--text-secondary)]'>
          Select setup rules and keep them ordered by execution sequence.
        </p>
        {s.selectedTemplate && (
          <div className='flex items-center gap-2 text-xs text-[var(--text-muted)]'>
            <span>Editing</span>
            <span>•</span>
            <span className='rounded-full bg-[var(--accent-soft)] px-2 py-0.5 font-medium text-[var(--accent)]'>
              {s.selectedTemplate.name}
            </span>
          </div>
        )}
      </div>

      <div className='mt-4 flex flex-wrap gap-2'>
        <input
          className='min-w-[280px] flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
          placeholder='Add a checklist item (e.g., HTF trend aligned)'
          value={s.newItemLabel}
          onChange={(e) => s.setNewItemLabel(e.target.value)}
          disabled={s.isAnyEditing || !s.selectedTemplateId}
        />
        <button
          className='rounded-lg border border-transparent bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
          onClick={s.addItem}
          disabled={s.isAnyEditing || !s.selectedTemplateId || !s.newItemLabel.trim()}>
          Add
        </button>
      </div>

      <ul className='mt-4 space-y-2'>
        {items.map((item: Item) => {
          const isEditing = s.editingItemId === item.id;

          return (
            <ItemRow
              key={item.id}
              item={item}
              isEditing={isEditing}
              isDropTarget={dragOverItemId === item.id && draggingItemId !== item.id}
              canDrag={canDrag}
              onDragStart={(itemId) => {
                setDraggingItemId(itemId);
                setDragOverItemId(null);
              }}
              onDragEnd={() => {
                setDraggingItemId(null);
                setDragOverItemId(null);
              }}
              onDragOver={(itemId) => {
                if (draggingItemId && draggingItemId !== itemId) {
                  setDragOverItemId(itemId);
                }
              }}
              onDrop={onDrop}
              state={s}
            />
          );
        })}

        {!items.length && (
          <li className='rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-4 text-sm text-[var(--text-muted)]'>
            No checklist items yet. Add your first execution rule above.
          </li>
        )}
      </ul>
    </section>
  );
}
