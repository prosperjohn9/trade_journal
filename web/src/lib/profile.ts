import { supabase } from '@/src/lib/supabaseClient';

export type Profile = {
  id: string;
  display_name: string | null;
  starting_balance: number | null;
  base_currency: string | null;
  updated_at?: string;
};

export async function getOrCreateProfile(): Promise<{
  user: any | null;
  profile: Profile | null;
}> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  const user = sessionData.session?.user ?? null;
  if (!user) return { user: null, profile: null };

  // Try to load profile
  const { data: existing, error: selErr } = await supabase
    .from('profiles')
    .select('id, display_name, starting_balance, base_currency')
    .eq('id', user.id)
    .single();

  // If row doesn't exist, create it
  if (selErr && selErr.code === 'PGRST116') {
    const { data: created, error: insErr } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        display_name: null,
        starting_balance: null,
        base_currency: 'USD',
      })
      .select('id, display_name, starting_balance, base_currency')
      .single();

    if (insErr) throw insErr;
    return { user, profile: created as Profile };
  }

  if (selErr) throw selErr;
  return { user, profile: existing as Profile };
}

export async function updateProfile(patch: {
  display_name?: string | null;
  starting_balance?: number | null;
  base_currency?: string | null;
}): Promise<Profile> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...(patch.display_name !== undefined
        ? { display_name: patch.display_name }
        : {}),
      ...(patch.starting_balance !== undefined
        ? { starting_balance: patch.starting_balance }
        : {}),
      ...(patch.base_currency !== undefined
        ? { base_currency: patch.base_currency }
        : {}),
    })
    .eq('id', user.id)
    .select('id, display_name, starting_balance, base_currency')
    .single();

  if (error) throw error;
  return data as Profile;
}