import { supabase } from '@/src/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

// Row shape in the `profiles` table. 
export type Profile = {
  id: string;
  display_name: string | null;
  starting_balance: number | null;
  base_currency: string | null;
  updated_at?: string;
};

// PostgREST error code returned by `.single()` when no rows are found.
const NO_ROW_CODE = 'PGRST116';

type PostgrestLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function getErrCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  return (err as PostgrestLikeError).code;
}

/**
 * Returns the authenticated user and their profile.
 * If the profile row does not exist yet, it creates one with defaults.
 **/
export async function getOrCreateProfile(): Promise<{
  user: User | null;
  profile: Profile | null;
}> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  const user = sessionData.session?.user ?? null;
  if (!user) return { user: null, profile: null };

  // 1) Try to load the existing profile.
  const { data: existing, error: selErr } = await supabase
    .from('profiles')
    .select('id, display_name, starting_balance, base_currency')
    .eq('id', user.id)
    .single();

  // 2) If it doesn't exist, create it.
  if (selErr && getErrCode(selErr) === NO_ROW_CODE) {
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

/**
 * Updates the signed-in user's profile with the provided patch.
 * Only keys present in `patch` are sent to the database.
 **/
export async function updateProfile(patch: {
  display_name?: string | null;
  starting_balance?: number | null;
  base_currency?: string | null;
}): Promise<Profile> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  const user = sessionData.session?.user;
  if (!user) throw new Error('Not authenticated');

  const update: Partial<Pick<Profile, 'display_name' | 'starting_balance' | 'base_currency'>> =
    {};

  if (patch.display_name !== undefined) update.display_name = patch.display_name;
  if (patch.starting_balance !== undefined)
    update.starting_balance = patch.starting_balance;
  if (patch.base_currency !== undefined) update.base_currency = patch.base_currency;

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .select('id, display_name, starting_balance, base_currency')
    .single();

  if (error) throw error;
  return data as Profile;
}