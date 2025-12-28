import { supabase } from './supabaseClient';

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
};

export async function getOrCreateProfile() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { profile: null, user: null };

  // 1) Try fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, timezone')
    .eq('id', user.id)
    .single();

  // 2) If profile exists, return it
  if (profile) return { profile: profile as Profile, user };

  // 3) Create profile with detected timezone
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const { data: created, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      timezone: tz,
      display_name: user.user_metadata?.name ?? null,
    })
    .select('id, display_name, timezone')
    .single();

  if (error) throw error;

  return { profile: created as Profile, user };
}

export async function updateProfile(updates: Partial<Profile>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new Error('Not logged in');

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('id, display_name, timezone')
    .single();

  if (error) throw error;
  return data as Profile;
}