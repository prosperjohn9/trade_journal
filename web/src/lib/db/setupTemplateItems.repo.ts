import { supabase } from '@/src/lib/supabase/client';

export type SetupItemRow = {
  id: string;
  label: string;
  sort_order: number;
};

export type SetupItemWithActiveRow = SetupItemRow & {
  is_active: boolean;
};

export async function fetchActiveSetupItemsByTemplate(
  templateId: string,
): Promise<SetupItemRow[]> {
  const { data, error } = await supabase
    .from('setup_template_items')
    .select('id, label, sort_order')
    .eq('template_id', templateId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SetupItemRow[];
}

export async function listTemplateItems(
  templateId: string,
): Promise<SetupItemWithActiveRow[]> {
  const { data, error } = await supabase
    .from('setup_template_items')
    .select('id, label, sort_order, is_active')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SetupItemWithActiveRow[];
}

export type SetupTemplateItemRow = {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};