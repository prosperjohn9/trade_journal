// Monthly cap on FREE cTrader Foresight reads only. cTrader Foresight is free, so
// it needs an abuse ceiling (80 / 200 / 600 a month by plan, unlimited for
// admins). MetaTrader Foresight is a PAID per-account seat ($18/account) and is
// NEVER capped, so this counts only reads on the user's cTrader accounts and is
// only ever called from the cTrader analyze route. User-asked reads are bounded
// separately by the AI-actions quota.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';
import { adminUserIdSet } from '@/src/lib/auth/admin';

/** True when the user has used up this month's free cTrader Foresight reads. */
export async function isOverCtraderReadCap(
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

  // Count this month's reads on this user's cTrader accounts only. MetaTrader
  // (paid) reads must never count against the free-lane cap.
  const { data: conns } = await sb
    .from('ctrader_connections')
    .select('account_id')
    .eq('user_id', userId);
  const accountIds = ((conns ?? []) as Array<{ account_id: string | null }>)
    .map((c) => c.account_id)
    .filter((id): id is string => !!id);
  if (!accountIds.length) return false;

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await sb
    .from('foresight_reads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('account_id', accountIds)
    .gte('created_at', start.toISOString());

  return (count ?? 0) >= cap;
}
