import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type Entitlements,
  type SubscriptionRow,
} from './entitlements';

/**
 * Resolve the caller's entitlements from a user-scoped Supabase client. RLS
 * returns only their own subscription row, so this is the server-side source of
 * truth for gating paid features.
 */
export async function getServerEntitlements(
  sb: SupabaseClient,
): Promise<Entitlements> {
  const { data } = await sb
    .from('subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .maybeSingle();
  return resolveEntitlements((data as SubscriptionRow | null) ?? null);
}
