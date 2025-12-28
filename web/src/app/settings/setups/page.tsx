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

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

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

    // pick default if exists; else first
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
      is_default: templates.length === 0, // first template becomes default
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

  async function renameTemplate(templateId: string) {
    const name = prompt('New template name:', selectedTemplate?.name || '');
    if (!name) return;

    setMsg('Renaming...');
    const { error } = await supabase
      .from('setup_templates')
      .update({ name: name.trim() })
      .eq('id', templateId);

    if (error) {
      setMsg(error.message);
      return;
    }

    await loadTemplates();
    setMsg('Renamed');
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

    // 1) unset current default(s)
    const { error: e1 } = await supabase
      .from('setup_templates')
      .update({ is_default: false })
      .eq('is_default', true);

    if (e1) {
      setMsg(e1.message);
      return;
    }

    // 2) set new default
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

  async function editItem(item: Item) {
    const label = prompt('Edit item label:', item.label);
    if (!label) return;

    setMsg('Saving...');
    const { error } = await supabase
      .from('setup_template_items')
      .update({ label: label.trim() })
      .eq('id', item.id);

    if (error) {
      setMsg(error.message);
      return;
    }

    await loadItems(item.template_id);
    setMsg('Saved');
    setTimeout(() => setMsg(''), 1200);
  }

  async function toggleItemActive(item: Item) {
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

  async function moveItem(item: Item, direction: 'UP' | 'DOWN') {
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx === -1) return;

    const swapWith = direction === 'UP' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= items.length) return;

    const other = items[swapWith];

    // swap sort_order
    const { error } = await supabase.from('setup_template_items').upsert([
      { id: item.id, sort_order: other.sort_order },
      { id: other.id, sort_order: item.sort_order },
    ]);

    if (error) {
      setMsg(error.message);
      return;
    }

    await loadItems(item.template_id);
  }

  if (loading) {
    return <main className='p-6'>Loading...</main>;
  }

  return (
    <main className='p-6 space-y-6'>
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Setups</h1>
          <p className='text-sm opacity-80'>
            Create your own entry criteria checklist. You’ll use these as
            checkboxes when reviewing trades.
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

      {/* Create template */}
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

      {/* Template selector */}
      <section className='border rounded-xl p-4 space-y-3 max-w-3xl'>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='font-semibold'>Your Templates</h2>

          {selectedTemplate && (
            <div className='flex flex-wrap gap-2'>
              <button
                className='border rounded-lg px-3 py-2'
                onClick={() => renameTemplate(selectedTemplate.id)}>
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
      </section>

      {/* Items */}
      {selectedTemplateId && (
        <section className='border rounded-xl p-4 space-y-4 max-w-3xl'>
          <div className='space-y-1'>
            <h2 className='font-semibold'>Checklist Items</h2>
            <p className='text-sm opacity-80'>
              These become checkboxes on the Trade Review page.
            </p>
          </div>

          <div className='flex flex-wrap gap-2'>
            <input
              className='border rounded-lg p-3 flex-1 min-w-[260px]'
              placeholder='Add a checklist item (e.g., HTF trend aligned)'
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
            />
            <button className='border rounded-lg px-4 py-2' onClick={addItem}>
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
                {items.map((it) => (
                  <tr key={it.id} className='border-b'>
                    <td className='p-2'>{it.label}</td>
                    <td className='p-2'>
                      <button
                        className='border rounded-lg px-3 py-1'
                        onClick={() => toggleItemActive(it)}>
                        {it.is_active ? 'Yes' : 'No'}
                      </button>
                    </td>
                    <td className='p-2'>{it.sort_order}</td>
                    <td className='p-2'>
                      <div className='flex flex-wrap gap-2'>
                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => moveItem(it, 'UP')}>
                          Up
                        </button>
                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => moveItem(it, 'DOWN')}>
                          Down
                        </button>
                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => editItem(it)}>
                          Edit
                        </button>
                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => deleteItem(it)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

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