// Monthly cap on always-on Foresight reads (the worker-fired co-pilot reads, both
// MetaTrader and cTrader). This is the abuse ceiling on the free cTrader co-pilot,
// not a target: 80 / 200 / 600 a month by plan, unlimited for admins. User-asked
// reads are separately bounded by the AI-actions quota.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';
import { adminUserIdSet } from '@/src/lib/auth/admin';

/** True when the user has used up this month's Foresight-read allowance. */
export async function isOverForesightCap(
  sb: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const admins = await adminUserIdSet(sb);
  if (admins.has(userId)) return false; // admins are unlimited

  const { data: sub } = await sb
    .from('subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
  const cap = resolveEntitlements((sub as SubscriptionRow | null) ?? null).limits
    .foresightReadsPerMonth;
  if (cap <= 0) return true; // not entitled

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await sb
    .from('foresight_reads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', start.toISOString());

  return (count ?? 0) >= cap;
}
