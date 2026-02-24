import { supabase } from '@/src/lib/supabase/client';

export type SetupTemplateRow = {
  id: string;
  name: string;
  is_default: boolean;
};

export async function fetchSetupTemplates(): Promise<SetupTemplateRow[]> {
  const { data, error } = await supabase
    .from('setup_templates')
    .select('id, name, is_default')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SetupTemplateRow[];
}