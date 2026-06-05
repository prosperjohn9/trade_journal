import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. It BYPASSES row level security, so it is
 * server-only and must never be imported into client code. Used by billing
 * webhooks and checkout to write the subscriptions / provider-plans tables,
 * which users are not allowed to write themselves.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase service role is not configured (SUPABASE_SERVICE_ROLE_KEY).',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
