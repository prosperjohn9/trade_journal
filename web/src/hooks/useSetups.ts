'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import { getErr } from '@/src/domain/errors';

export type Template = {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
};

export type Item = {
  id: string;
  template_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type DeleteTarget =
  | { kind: 'item'; item: Item }
  | { kind: 'template'; template: Template };

export function useSetups() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [userId, setUserId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [items, setItems] = useState<Item[]>([]);

  const [newTemplateName, setNewTemplateName] = useState('');
  const [newItemLabel, setNewItemLabel] = useState('');

  const [isRenamingTemplate, setIsRenamingTemplate] = useState(false);
  const [renameTemplateValue, setRenameTemplateValue] = useState('');

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemValue, setEditingItemValue] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const isAnyEditing = editingItemId !== null || isRenamingTemplate;

  async function loadTemplates(uId: string) {
    const { data, error } = await supabase
      .from('setup_templates')
      .select('id, user_id, name, is_default, created_at')
      .eq('user_id', uId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const list = (data ?? []) as Template[];
    setTemplates(list);

    const def = list.find((t) => t.is_default);
    const pick = def?.id ?? list[0]?.id ?? '';
    setSelectedTemplateId((prev) => prev || pick);

    return list;
  }

  async function loadItems(templateId: string) {
    const { data, error } = await supabase
      .from('setup_template_items')
      .select('id, template_id, label, sort_order, is_active, created_at')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    setItems((data ?? []) as Item[]);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setMsg('');

      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const u = data.user;
        if (!u) {
          router.push('/auth');
          return;
        }

        if (cancelled) return;

        setUserId(u.id);
        await loadTemplates(u.id);
      } catch (e: unknown) {
        if (!cancelled) {
          setMsg(getErr(e, 'Failed to load setups'));
          router.push('/auth');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedTemplateId) return;

    let cancelled = false;
    (async () => {
      try {
        await loadItems(selectedTemplateId);
      } catch (e: unknown) {
        if (!cancelled) setMsg(getErr(e, 'Failed to load items'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;

    setRenameTemplateValue(tpl.name);
    setIsRenamingTemplate(false);
  }, [selectedTemplateId, templates]);

  async function createTemplate() {
    const name = newTemplateName.trim();
    if (!name) return;

    if (!userId) {
      router.push('/auth');
      return;
    }

    setMsg('Creating template...');

    try {
      const { error } = await supabase.from('setup_templates').insert({
        user_id: userId,
        name,
        is_default: templates.length === 0,
      });

      if (error) throw error;

      setNewTemplateName('');
      setMsg('Created');
      await loadTemplates(userId);
      window.setTimeout(() => setMsg(''), 1200);
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to create template'));
    }
  }

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

  async function saveRenameTemplate(templateId: string) {
    const name = renameTemplateValue.trim();
    if (!name) return;

    setMsg('Renaming...');

    try {
      const { error } = await supabase
        .from('setup_templates')
        .update({ name })
        .eq('id', templateId);

      if (error) throw error;

      if (userId) await loadTemplates(userId);
      setMsg('Renamed');
      setIsRenamingTemplate(false);
      window.setTimeout(() => setMsg(''), 1200);
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to rename template'));
    }
  }

  function requestDeleteTemplate() {
    if (!selectedTemplate) return;
    setDeleteTarget({ kind: 'template', template: selectedTemplate });
  }

  async function setDefaultTemplate(templateId: string) {
    if (!userId) {
      router.push('/auth');
      return;
    }

    setMsg('Setting default...');

    try {
      const { error: e1 } = await supabase
        .from('setup_templates')
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('is_default', true);

      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from('setup_templates')
        .update({ is_default: true })
        .eq('user_id', userId)
        .eq('id', templateId);

      if (e2) throw e2;

      await loadTemplates(userId);
      setMsg('Default set');
      window.setTimeout(() => setMsg(''), 1200);
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to set default'));
    }
  }

  async function addItem() {
    const label = newItemLabel.trim();
    if (!label || !selectedTemplateId) return;

    const nextOrder =
      items.length === 0 ? 0 : Math.max(...items.map((i) => i.sort_order)) + 1;

    setMsg('Adding item...');

    try {
      const { error } = await supabase.from('setup_template_items').insert({
        template_id: selectedTemplateId,
        label,
        sort_order: nextOrder,
        is_active: true,
      });

      if (error) throw error;

      setNewItemLabel('');
      await loadItems(selectedTemplateId);
      setMsg('Item added');
      window.setTimeout(() => setMsg(''), 1000);
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to add item'));
    }
  }

  function startEditItem(it: Item) {
    setEditingItemId(it.id);
    setEditingItemValue(it.label);
  }

  function cancelEditItem() {
    setEditingItemId(null);
    setEditingItemValue('');
  }

  async function saveEditItem(item: Item) {
    const label = editingItemValue.trim();
    if (!label) return;

    setMsg('Saving...');

    try {
      const { error } = await supabase
        .from('setup_template_items')
        .update({ label })
        .eq('id', item.id);

      if (error) throw error;

      await loadItems(item.template_id);
      setMsg('Saved');
      setEditingItemId(null);
      setEditingItemValue('');
      window.setTimeout(() => setMsg(''), 1000);
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to save item'));
    }
  }

  async function toggleItemActive(item: Item) {
    if (isAnyEditing) return;

    try {
      const { error } = await supabase
        .from('setup_template_items')
        .update({ is_active: !item.is_active })
        .eq('id', item.id);

      if (error) throw error;
      await loadItems(item.template_id);
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to toggle item'));
    }
  }

  async function moveItem(item: Item, direction: 'UP' | 'DOWN') {
    if (isAnyEditing) return;

    const idx = items.findIndex((i) => i.id === item.id);
    if (idx === -1) return;

    const swapWith = direction === 'UP' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= items.length) return;

    const other = items[swapWith];

    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], sort_order: other.sort_order };
      copy[swapWith] = { ...copy[swapWith], sort_order: item.sort_order };
      copy.sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.created_at.localeCompare(b.created_at),
      );
      return copy;
    });

    setMsg('Reordering...');

    try {
      const { error: e1 } = await supabase
        .from('setup_template_items')
        .update({ sort_order: other.sort_order })
        .eq('id', item.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from('setup_template_items')
        .update({ sort_order: item.sort_order })
        .eq('id', other.id);
      if (e2) throw e2;

      await loadItems(item.template_id);
      setMsg('');
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to reorder'));
      await loadItems(item.template_id);
    }
  }

  function requestDeleteItem(item: Item) {
    setDeleteTarget({ kind: 'item', item });
  }

  function closeDelete() {
    if (deleting) return;
    setDeleteTarget(null);
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

        if (userId) await loadTemplates(userId);
        window.setTimeout(() => setMsg(''), 1200);
        return;
      }

      const item = deleteTarget.item;
      const { error } = await supabase
        .from('setup_template_items')
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      setDeleteTarget(null);
      await loadItems(item.template_id);
      setMsg('Deleted');
      window.setTimeout(() => setMsg(''), 1000);
    } catch (e: unknown) {
      setMsg(getErr(e, 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  }

  return {
    router,

    loading,
    msg,

    templates,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedTemplate,

    items,

    newTemplateName,
    setNewTemplateName,
    createTemplate,

    newItemLabel,
    setNewItemLabel,
    addItem,

    isRenamingTemplate,
    renameTemplateValue,
    setRenameTemplateValue,
    startRenameTemplate,
    cancelRenameTemplate,
    saveRenameTemplate,

    setDefaultTemplate,

    editingItemId,
    editingItemValue,
    setEditingItemValue,
    startEditItem,
    cancelEditItem,
    saveEditItem,

    toggleItemActive,
    moveItem,

    deleteTarget,
    deleting,
    requestDeleteTemplate,
    requestDeleteItem,
    closeDelete,
    confirmDelete,

    isAnyEditing,
  };
}

export type SetupsState = ReturnType<typeof useSetups>;