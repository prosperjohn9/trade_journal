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

export type CtraderReadUsage = {
  used: number;
  cap: number;
  unlimited: boolean;
  hasCtrader: boolean;
};

/** This month's free cTrader Foresight read usage for a user. */
export async function ctraderReadUsage(
  sb: SupabaseClient,
  userId: string,
): Promise<CtraderReadUsage> {
  const admins = await adminUserIdSet(sb);
  const unlimited = admins.has(userId);

  const { data: sub } = await sb
    .from('subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
  const cap = resolveEntitlements((sub as SubscriptionRow | null) ?? null).limits
    .foresightReadsPerMonth;

  // Only reads on this user's cTrader accounts count; MetaTrader (paid) never does.
  const { data: conns } = await sb
    .from('ctrader_connections')
    .select('account_id')
    .eq('user_id', userId);
  const accountIds = ((conns ?? []) as Array<{ account_id: string | null }>)
    .map((c) => c.account_id)
    .filter((id): id is string => !!id);
  if (!accountIds.length) {
    return { used: 0, cap, unlimited, hasCtrader: false };
  }

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await sb
    .from('foresight_reads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('account_id', accountIds)
    .gte('created_at', start.toISOString());

  return { used: count ?? 0, cap, unlimited, hasCtrader: true };
}

/** True when the user has used up this month's free cTrader Foresight reads. */
export async function isOverCtraderReadCap(
  sb: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { used, cap, unlimited, hasCtrader } = await ctraderReadUsage(sb, userId);
  if (unlimited) return false;
  if (cap <= 0) return true; // not entitled
  if (!hasCtrader) return false;
  return used >= cap;
}
