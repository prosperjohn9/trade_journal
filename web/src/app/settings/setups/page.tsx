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

type DeleteTarget =
  | { kind: 'item'; item: Item }
  | { kind: 'template'; template: Template };

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center p-4'
      aria-modal='true'
      role='dialog'>
      <button
        className='absolute inset-0 bg-black/40'
        onClick={onClose}
        aria-label='Close modal'
      />
      <div className='relative w-full max-w-md rounded-xl border bg-white p-4 shadow-lg'>
        <div className='flex items-start justify-between gap-3'>
          <div className='text-lg font-semibold'>{title}</div>
          <button className='border rounded-lg px-3 py-1' onClick={onClose}>
            ✕
          </button>
        </div>
        <div className='mt-3'>{children}</div>
      </div>
    </div>
  );
}

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

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  function requestDeleteTemplate() {
    if (!selectedTemplate) return;
    setDeleteTarget({ kind: 'template', template: selectedTemplate });
  }

  function requestDeleteItem(item: Item) {
    setDeleteTarget({ kind: 'item', item });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    setMsg('Deleting...');

    try {
      if (deleteTarget.kind === 'template') {
        const templateId = deleteTarget.template.id;

        const { error } = await supabase
          .from('setup_templates')
          .delete()
          .eq('id', templateId);

        if (error) throw error;

        setMsg('Deleted');
        setSelectedTemplateId('');
        setDeleteTarget(null);

        await loadTemplates();
        setTimeout(() => setMsg(''), 1500);
        return;
      }

      if (deleteTarget.kind === 'item') {
        const item = deleteTarget.item;

        const { error } = await supabase
          .from('setup_template_items')
          .delete()
          .eq('id', item.id);

        if (error) throw error;

        setDeleteTarget(null);
        await loadItems(item.template_id);
        setMsg('Deleted');
        setTimeout(() => setMsg(''), 1200);
      }
    } catch (err: any) {
      console.error(err);
      setMsg(err?.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
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

  // Save item edit
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
    if (isAnyEditing) return;

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

  // Explicit updates to swap sort_order
  async function moveItem(item: Item, direction: 'UP' | 'DOWN') {
    if (isAnyEditing) return;

    const idx = items.findIndex((i) => i.id === item.id);
    if (idx === -1) return;

    const swapWith = direction === 'UP' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= items.length) return;

    const other = items[swapWith];

    // Optimistic UI swap
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], sort_order: other.sort_order };
      copy[swapWith] = { ...copy[swapWith], sort_order: item.sort_order };
      copy.sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.created_at.localeCompare(b.created_at)
      );
      return copy;
    });

    setMsg('Reordering...');

    const { error: e1 } = await supabase
      .from('setup_template_items')
      .update({ sort_order: other.sort_order })
      .eq('id', item.id);

    if (e1) {
      setMsg(e1.message);
      await loadItems(item.template_id);
      return;
    }

    const { error: e2 } = await supabase
      .from('setup_template_items')
      .update({ sort_order: item.sort_order })
      .eq('id', other.id);

    if (e2) {
      setMsg(e2.message);
      await loadItems(item.template_id);
      return;
    }

    await loadItems(item.template_id);
    setMsg('');
  }

  if (loading) return <main className='p-6'>Loading...</main>;

  const deleteTitle =
    deleteTarget?.kind === 'template'
      ? 'Delete setup template?'
      : 'Delete checklist item?';

  const deleteBody =
    deleteTarget?.kind === 'template'
      ? `This will delete "${deleteTarget.template.name}" and all its items. This cannot be undone.`
      : deleteTarget?.kind === 'item'
      ? `This will delete "${deleteTarget.item.label}". This cannot be undone.`
      : '';

  return (
    <main className='p-6 space-y-6'>
      {/* DELETE MODAL */}
      <Modal
        open={!!deleteTarget}
        title={deleteTitle}
        onClose={() => (deleting ? null : setDeleteTarget(null))}>
        <p className='text-sm opacity-80'>{deleteBody}</p>
        <div className='mt-4 flex gap-2 justify-end'>
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}>
            Cancel
          </button>
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={confirmDelete}
            disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>

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
            disabled={isAnyEditing}
          />
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={createTemplate}
            disabled={isAnyEditing}>
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
                    className='border rounded-lg px-3 py-2 disabled:opacity-60'
                    onClick={startRenameTemplate}
                    disabled={isAnyEditing}>
                    Rename
                  </button>
                  <button
                    className='border rounded-lg px-3 py-2 disabled:opacity-60'
                    onClick={() => setDefaultTemplate(selectedTemplate.id)}
                    disabled={isAnyEditing}>
                    Set Default
                  </button>
                  <button
                    className='border rounded-lg px-3 py-2 disabled:opacity-60'
                    onClick={requestDeleteTemplate}
                    disabled={isAnyEditing}>
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    className='border rounded-lg px-3 py-2 disabled:opacity-60'
                    onClick={() => saveRenameTemplate(selectedTemplate.id)}
                    disabled={isAnyEditing}>
                    Save
                  </button>
                  <button
                    className='border rounded-lg px-3 py-2 disabled:opacity-60'
                    onClick={cancelRenameTemplate}
                    disabled={isAnyEditing}>
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
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          disabled={isAnyEditing}>
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
              disabled={isAnyEditing}
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
                            autoFocus
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
                        {/* Cleaner UI: when editing, ONLY show Save/Cancel */}
                        {!isEditing ? (
                          <div className='flex flex-wrap gap-2'>
                            <button
                              className='border rounded-lg px-3 py-1 disabled:opacity-60'
                              onClick={() => moveItem(it, 'UP')}
                              disabled={isAnyEditing || isFirst}
                              title={isFirst ? 'Already at top' : ''}>
                              Up
                            </button>

                            <button
                              className='border rounded-lg px-3 py-1 disabled:opacity-60'
                              onClick={() => moveItem(it, 'DOWN')}
                              disabled={isAnyEditing || isLast}
                              title={isLast ? 'Already at bottom' : ''}>
                              Down
                            </button>

                            <button
                              className='border rounded-lg px-3 py-1 disabled:opacity-60'
                              onClick={() => startEditItem(it)}
                              disabled={isAnyEditing || isRenamingTemplate}>
                              Edit
                            </button>

                            <button
                              className='border rounded-lg px-3 py-1 disabled:opacity-60'
                              onClick={() => requestDeleteItem(it)}
                              disabled={isAnyEditing}>
                              Delete
                            </button>
                          </div>
                        ) : (
                          <div className='flex flex-wrap gap-2'>
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
      )}
    </main>
  );
}