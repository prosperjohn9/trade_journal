'use client';

import type { Item, SetupsState } from '@/src/hooks/useSetups';

export function SetupsItemsPanel({
  state: s,
}: {
  state: Pick<
    SetupsState,
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
    | 'moveItem'
    | 'requestDeleteItem'
  >;
}) {
  const items = s.items;

  return (
    <section className='border rounded-xl p-4 space-y-4 max-w-3xl'>
      <div className='space-y-1'>
        <h2 className='font-semibold'>Checklist Items</h2>
        <p className='text-sm opacity-80'>
          These become checkboxes on the Add Trade page.
        </p>
      </div>

      <div className='flex flex-wrap gap-2'>
        <input
          className='border rounded-lg p-3 flex-1 min-w-[260px]'
          placeholder='Add a checklist item (e.g., HTF trend aligned)'
          value={s.newItemLabel}
          onChange={(e) => s.setNewItemLabel(e.target.value)}
          disabled={s.isAnyEditing}
        />
        <button
          className='border rounded-lg px-4 py-2 disabled:opacity-60'
          onClick={s.addItem}
          disabled={s.isAnyEditing}>
          Add
        </button>
      </div>

      <div className='border rounded-xl overflow-hidden'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-left border-b'>
              <th className='p-2'>Item</th>
              <th className='p-2'>Active</th>
              <th className='p-2'>Order</th>
              <th className='p-2'>Actions</th>
            </tr>
          </thead>

          <tbody>
            {items.map((it: Item, index: number) => {
              const isEditing = s.editingItemId === it.id;
              const isFirst = index === 0;
              const isLast = index === items.length - 1;

              return (
                <tr key={it.id} className='border-b align-top'>
                  <td className='p-2'>
                    {!isEditing ? (
                      it.label
                    ) : (
                      <input
                        className='border rounded-lg p-2 w-full'
                        value={s.editingItemValue}
                        onChange={(e) => s.setEditingItemValue(e.target.value)}
                        autoFocus
                      />
                    )}
                  </td>

                  <td className='p-2'>
                    <button
                      className='border rounded-lg px-3 py-1 disabled:opacity-60'
                      onClick={() => s.toggleItemActive(it)}
                      disabled={s.isAnyEditing}
                      title={
                        s.isAnyEditing ? 'Finish editing before toggling' : ''
                      }>
                      {it.is_active ? 'Yes' : 'No'}
                    </button>
                  </td>

                  <td className='p-2'>{it.sort_order}</td>

                  <td className='p-2'>
                    {!isEditing ? (
                      <div className='flex flex-wrap gap-2'>
                        <button
                          className='border rounded-lg px-3 py-1 disabled:opacity-60'
                          onClick={() => s.moveItem(it, 'UP')}
                          disabled={s.isAnyEditing || isFirst}
                          title={isFirst ? 'Already at top' : ''}>
                          Up
                        </button>

                        <button
                          className='border rounded-lg px-3 py-1 disabled:opacity-60'
                          onClick={() => s.moveItem(it, 'DOWN')}
                          disabled={s.isAnyEditing || isLast}
                          title={isLast ? 'Already at bottom' : ''}>
                          Down
                        </button>

                        <button
                          className='border rounded-lg px-3 py-1 disabled:opacity-60'
                          onClick={() => s.startEditItem(it)}
                          disabled={s.isAnyEditing}>
                          Edit
                        </button>

                        <button
                          className='border rounded-lg px-3 py-1 disabled:opacity-60'
                          onClick={() => s.requestDeleteItem(it)}
                          disabled={s.isAnyEditing}>
                          Delete
                        </button>
                      </div>
                    ) : (
                      <div className='flex flex-wrap gap-2'>
                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => s.saveEditItem(it)}>
                          Save
                        </button>
                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={s.cancelEditItem}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {!items.length && (
              <tr>
                <td className='p-2 opacity-70' colSpan={4}>
                  No items yet. Add your criteria above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}