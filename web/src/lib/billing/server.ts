import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adminEntitlements,
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type Entitlements,
  type SubscriptionRow,
} from './entitlements';
import { isAdminEmail } from '@/src/lib/auth/admin';

/**
 * Resolve the caller's entitlements from a user-scoped Supabase client. RLS
 * returns only their own subscription row, so this is the server-side source of
 * truth for gating paid features. The owner/admin gets full access regardless of
 * any subscription.
 */
export async function getServerEntitlements(
  sb: SupabaseClient,
): Promise<Entitlements> {
  const { data: userData } = await sb.auth.getUser();
  if (isAdminEmail(userData.user?.email)) return adminEntitlements();

  const { data } = await sb
    .from('subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .maybeSingle();
  return resolveEntitlements((data as SubscriptionRow | null) ?? null);
}
