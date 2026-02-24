import type { User } from '@supabase/supabase-js';
import { supabase } from '@/src/lib/supabase/client';

export async function getUserOrNull(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message || 'Failed to retrieve user');
  }

  return data.user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getUserOrNull();

  if (!user) {
    throw new Error('Not authenticated');
  }

  return user;
}