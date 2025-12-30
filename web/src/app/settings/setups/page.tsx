'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Template = {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
};

type Item = {
  id: string;
  template_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export default function SetupsPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);

  const [newTemplateName, setNewTemplateName] = useState('');
  const [newItemLabel, setNewItemLabel] = useState('');

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Inline rename template
  const [isRenamingTemplate, setIsRenamingTemplate] = useState(false);
  const [renameTemplateValue, setRenameTemplateValue] = useState('');

  // Inline edit checklist item
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemValue, setEditingItemValue] = useState<string>('');

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const isAnyEditing = editingItemId !== null;

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return router.push('/auth');
      await loadTemplates();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) return;
    (async () => {
      await loadItems(selectedTemplateId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId]);

  // keep rename box in sync when switching templates
  useEffect(() => {
    if (!selectedTemplate) return;
    setRenameTemplateValue(selectedTemplate.name);
    setIsRenamingTemplate(false);
  }, [selectedTemplate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTemplates() {
    const { data, error } = await supabase
      .from('setup_templates')
      .select('id, name, is_default, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      setMsg(error.message);
      return;
    }

    const list = (data || []) as Template[];
    setTemplates(list);

    const def = list.find((t) => t.is_default);
    const pick = def?.id || list[0]?.id || '';
    setSelectedTemplateId((prev) => prev || pick);
  }

  async function loadItems(templateId: string) {
    const { data, error } = await supabase
      .from('setup_template_items')
      .select('id, template_id, label, sort_order, is_active, created_at')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      setMsg(error.message);
      return;
    }

    setItems((data || []) as Item[]);
  }

  async function createTemplate() {
    const name = newTemplateName.trim();
    if (!name) return;

    setMsg('Creating template...');
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return router.push('/auth');

    const { error } = await supabase.from('setup_templates').insert({
      user_id: userId,
      name,
      is_default: templates.length === 0,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setNewTemplateName('');
    setMsg('Created');
    await loadTemplates();
    setTimeout(() => setMsg(''), 1500);
  }

  // Start/Cancel rename UI
  function startRenameTemplate() {
    if (!selectedTemplate) return;
    setRenameTemplateValue(selectedTemplate.name);
    setIsRenamingTemplate(true);
  }

  function cancelRenameTemplate() {
    if (!selectedTemplate) return;
    setRenameTemplateValue(selectedTemplate.name);
    setIsRenamingTemplate(false);
  }

  // Save rename (no prompt)
  async function saveRenameTemplate(templateId: string) {
    const name = renameTemplateValue.trim();
    if (!name) return;

    setMsg('Renaming...');
    const { error } = await supabase
      .from('setup_templates')
      .update({ name })
      .eq('id', templateId);

    if (error) {
      setMsg(error.message);
      return;
    }

    await loadTemplates();
    setMsg('Renamed');
    setIsRenamingTemplate(false);
    setTimeout(() => setMsg(''), 1500);
  }

  async function deleteTemplate(templateId: string) {
    const ok = confirm(
      'Delete this setup template? Items will be deleted too.'
    );
    if (!ok) return;

    setMsg('Deleting...');
    const { error } = await supabase
      .from('setup_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg('Deleted');
    setSelectedTemplateId('');
    await loadTemplates();
    setTimeout(() => setMsg(''), 1500);
  }

  async function setDefaultTemplate(templateId: string) {
    setMsg('Setting default...');

    const { error: e1 } = await supabase
      .from('setup_templates')
      .update({ is_default: false })
      .eq('is_default', true);
    if (e1) {
      setMsg(e1.message);
      return;
    }

    const { error: e2 } = await supabase
      .from('setup_templates')
      .update({ is_default: true })
      .eq('id', templateId);
    if (e2) {
      setMsg(e2.message);
      return;
    }

    await loadTemplates();
    setMsg('Default set');
    setTimeout(() => setMsg(''), 1500);
  }

  async function addItem() {
    const label = newItemLabel.trim();
    if (!label || !selectedTemplateId) return;

    const nextOrder =
      items.length === 0 ? 0 : Math.max(...items.map((i) => i.sort_order)) + 1;

    setMsg('Adding item...');
    const { error } = await supabase.from('setup_template_items').insert({
      template_id: selectedTemplateId,
      label,
      sort_order: nextOrder,
      is_active: true,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setNewItemLabel('');
    await loadItems(selectedTemplateId);
    setMsg('Item added');
    setTimeout(() => setMsg(''), 1200);
  }

  // Start/Cancel edit item UI
  function startEditItem(it: Item) {
    setEditingItemId(it.id);
    setEditingItemValue(it.label);
  }

  function cancelEditItem() {
    setEditingItemId(null);
    setEditingItemValue('');
  }

  // Save item edit (no prompt)
  async function saveEditItem(item: Item) {
    const label = editingItemValue.trim();
    if (!label) return;

    setMsg('Saving...');
    const { error } = await supabase
      .from('setup_template_items')
      .update({ label })
      .eq('id', item.id);

    if (error) {
      setMsg(error.message);
      return;
    }

    await loadItems(item.template_id);
    setMsg('Saved');
    setEditingItemId(null);
    setEditingItemValue('');
    setTimeout(() => setMsg(''), 1200);
  }

  async function toggleItemActive(item: Item) {
    if (isAnyEditing) return; // Prevent while editing
    const { error } = await supabase
      .from('setup_template_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);

    if (error) {
      setMsg(error.message);
      return;
    }

    await loadItems(item.template_id);
  }

  async function deleteItem(item: Item) {
    if (isAnyEditing) return; // Prevent while editing
    const ok = confirm('Delete this checklist item?');
    if (!ok) return;

    const { error } = await supabase
      .from('setup_template_items')
      .delete()
      .eq('id', item.id);

    if (error) {
      setMsg(error.message);
      return;
    }

    await loadItems(item.template_id);
  }

  // Explicit updates to swap sort_order (more reliable than upsert)
  async function moveItem(item: Item, direction: 'UP' | 'DOWN') {
    if (isAnyEditing) return; // Prevent while editing

    const idx = items.findIndex((i) => i.id === item.id);
    if (idx === -1) return;

    const swapWith = direction === 'UP' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= items.length) return;

    const other = items[swapWith];

    // Optimistic UI swap (instant feedback)
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], sort_order: other.sort_order };
      copy[swapWith] = { ...copy[swapWith], sort_order: item.sort_order };
      // keep display order consistent after swap
      copy.sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.created_at.localeCompare(b.created_at)
      );
      return copy;
    });

    setMsg('Reordering...');

    // Swap in DB
    const { error: e1 } = await supabase
      .from('setup_template_items')
      .update({ sort_order: other.sort_order })
      .eq('id', item.id);

    if (e1) {
      setMsg(e1.message);
      await loadItems(item.template_id); // revert from DB state
      return;
    }

    const { error: e2 } = await supabase
      .from('setup_template_items')
      .update({ sort_order: item.sort_order })
      .eq('id', other.id);

    if (e2) {
      setMsg(e2.message);
      await loadItems(item.template_id); // revert from DB state
      return;
    }

    await loadItems(item.template_id);
    setMsg('');
  }

  if (loading) return <main className='p-6'>Loading...</main>;

  return (
    <main className='p-6 space-y-6'>
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Setups</h1>
          <p className='text-sm opacity-80'>
            Create your own entry criteria checklists. These appear as
            checkboxes when you add a trade.
          </p>
          {msg && <p className='text-sm opacity-80'>{msg}</p>}
        </div>

        <div className='flex gap-2'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </div>
      </header>

      <section className='border rounded-xl p-4 space-y-3 max-w-3xl'>
        <h2 className='font-semibold'>Create Setup Template</h2>
        <div className='flex flex-wrap gap-2'>
          <input
            className='border rounded-lg p-3 flex-1 min-w-[260px]'
            placeholder='e.g., London Breakout'
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
          />
          <button
            className='border rounded-lg px-4 py-2'
            onClick={createTemplate}>
            Create
          </button>
        </div>
      </section>

      <section className='border rounded-xl p-4 space-y-3 max-w-3xl'>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='font-semibold'>Your Templates</h2>

          {selectedTemplate && (
            <div className='flex flex-wrap gap-2'>
              {!isRenamingTemplate ? (
                <>
                  <button
                    className='border rounded-lg px-3 py-2'
                    onClick={startRenameTemplate}>
                    Rename
                  </button>
                  <button
                    className='border rounded-lg px-3 py-2'
                    onClick={() => setDefaultTemplate(selectedTemplate.id)}>
                    Set Default
                  </button>
                  <button
                    className='border rounded-lg px-3 py-2'
                    onClick={() => deleteTemplate(selectedTemplate.id)}>
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    className='border rounded-lg px-3 py-2'
                    onClick={() => saveRenameTemplate(selectedTemplate.id)}>
                    Save
                  </button>
                  <button
                    className='border rounded-lg px-3 py-2'
                    onClick={cancelRenameTemplate}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <select
          className='border rounded-lg p-3 w-full'
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}>
          {!templates.length && <option value=''>No templates yet</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.is_default ? ' (default)' : ''}
            </option>
          ))}
        </select>

        {selectedTemplate && isRenamingTemplate && (
          <div className='flex flex-wrap gap-2'>
            <input
              className='border rounded-lg p-3 flex-1 min-w-[260px]'
              value={renameTemplateValue}
              onChange={(e) => setRenameTemplateValue(e.target.value)}
              placeholder='New template name'
            />
          </div>
        )}
      </section>

      {selectedTemplateId && (
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
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
              disabled={isAnyEditing}
            />
            <button
              className='border rounded-lg px-4 py-2 disabled:opacity-60'
              onClick={addItem}
              disabled={isAnyEditing}>
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
                {items.map((it, index) => {
                  const isEditing = editingItemId === it.id;
                  const disableRowActions = isAnyEditing && !isEditing; // lock other rows too

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
                            value={editingItemValue}
                            onChange={(e) =>
                              setEditingItemValue(e.target.value)
                            }
                          />
                        )}
                      </td>

                      <td className='p-2'>
                        <button
                          className='border rounded-lg px-3 py-1 disabled:opacity-60'
                          onClick={() => toggleItemActive(it)}
                          disabled={isAnyEditing}
                          title={
                            isAnyEditing ? 'Finish editing before toggling' : ''
                          }>
                          {it.is_active ? 'Yes' : 'No'}
                        </button>
                      </td>

                      <td className='p-2'>{it.sort_order}</td>

                      <td className='p-2'>
                        <div className='flex flex-wrap gap-2'>
                          <button
                            className='border rounded-lg px-3 py-1 disabled:opacity-60'
                            onClick={() => moveItem(it, 'UP')}
                            disabled={isAnyEditing || isFirst}
                            title={
                              isAnyEditing
                                ? 'Finish editing before reordering'
                                : isFirst
                                ? 'Already at top'
                                : ''
                            }>
                            Up
                          </button>

                          <button
                            className='border rounded-lg px-3 py-1 disabled:opacity-60'
                            onClick={() => moveItem(it, 'DOWN')}
                            disabled={isAnyEditing || isLast}
                            title={
                              isAnyEditing
                                ? 'Finish editing before reordering'
                                : isLast
                                ? 'Already at bottom'
                                : ''
                            }>
                            Down
                          </button>

                          {!isEditing ? (
                            <button
                              className='border rounded-lg px-3 py-1 disabled:opacity-60'
                              onClick={() => startEditItem(it)}
                              disabled={disableRowActions || isRenamingTemplate}
                              title={
                                disableRowActions
                                  ? 'Finish editing the current row first'
                                  : ''
                              }>
                              Edit
                            </button>
                          ) : (
                            <>
                              <button
                                className='border rounded-lg px-3 py-1'
                                onClick={() => saveEditItem(it)}>
                                Save
                              </button>
                              <button
                                className='border rounded-lg px-3 py-1'
                                onClick={cancelEditItem}>
                                Cancel
                              </button>
                            </>
                          )}

                          <button
                            className='border rounded-lg px-3 py-1 disabled:opacity-60'
                            onClick={() => deleteItem(it)}
                            disabled={isAnyEditing}
                            title={
                              isAnyEditing
                                ? 'Finish editing before deleting'
                                : ''
                            }>
                            Delete
                          </button>
                        </div>
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
      )}
    </main>
  );
}