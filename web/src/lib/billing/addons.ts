// Per-account add-on pricing and reconciliation.
//   - mt_sync   ($6/account/month):  extra MetaTrader auto-sync accounts.
//   - guardrail ($18/account/month): real-time Foresight seats, i.e. how many
//     MetaTrader accounts the user may turn Foresight on for.
// One-period purchases (x10 for yearly). The cron expires due ones and keeps the
// per-user counters on subscriptions (extra_synced_accounts, guardrail_seats) in
// sync with the user's active add-ons.

import type { createServiceClient } from '@/src/lib/supabase/admin';
import { EXTRA_SYNC_PRICE_MONTHLY, GUARDRAIL_PRICE_MONTHLY } from './plans';

type Admin = ReturnType<typeof createServiceClient>;

export type AddonKind = 'mt_sync' | 'guardrail';
export type AddonCycle = 'monthly' | 'yearly';

export function isAddonKind(v: unknown): v is AddonKind {
  return v === 'mt_sync' || v === 'guardrail';
}

/** Monthly unit price for an add-on kind (USD). */
export function addonUnitPrice(kind: AddonKind): number {
  switch (kind) {
    case 'mt_sync':
      return EXTRA_SYNC_PRICE_MONTHLY;
    case 'guardrail':
      return GUARDRAIL_PRICE_MONTHLY;
  }
}

/** Total charge for a purchase. Yearly bills 10x the monthly (two months free),
 *  matching the base-plan annual discount. */
export function addonAmount(
  kind: AddonKind,
  quantity: number,
  cycle: AddonCycle,
): number {
  const unit = addonUnitPrice(kind);
  return unit * quantity * (cycle === 'yearly' ? 10 : 1);
}

export function addonPeriodEnd(cycle: AddonCycle, from: Date = new Date()): Date {
  const d = new Date(from);
  if (cycle === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

type AddonRow = { quantity: number; current_period_end: string | null };

/** Sum of a user's active, unexpired add-on quantities for one kind. */
export async function activeAddonQuantity(
  admin: Admin,
  userId: string,
  kind: AddonKind,
  now: number = Date.now(),
): Promise<number> {
  const { data } = await admin
    .from('subscription_addons')
    .select('quantity, current_period_end')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('status', 'active');
  return ((data ?? []) as AddonRow[]).reduce((sum, a) => {
    const live =
      a.current_period_end == null ||
      new Date(a.current_period_end).getTime() > now;
    return live ? sum + Number(a.quantity) : sum;
  }, 0);
}

/** Recompute and persist a user's add-on-derived counters (extra synced
 *  accounts and guardrail seats) from their active add-ons. Called right after
 *  an add-on is activated and whenever one expires. */
export async function recomputeUserAddons(
  admin: Admin,
  userId: string,
): Promise<void> {
  const [extra, seats] = await Promise.all([
    activeAddonQuantity(admin, userId, 'mt_sync'),
    activeAddonQuantity(admin, userId, 'guardrail'),
  ]);
  await admin
    .from('subscriptions')
    .update({
      extra_synced_accounts: extra,
      guardrail_seats: seats,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

/** Activate a pending add-on after its payment succeeds. Idempotent: a second
 *  call for an already-active row is a no-op. Returns true when the tx_ref
 *  belonged to an add-on (so the webhook should not treat it as a base plan). */
export async function activateAddonByTxRef(
  admin: Admin,
  txRef: string,
  providerCustomerId: string | null,
): Promise<boolean> {
  const { data: addon } = await admin
    .from('subscription_addons')
    .select('id, user_id, status, billing_cycle')
    .eq('tx_ref', txRef)
    .maybeSingle();
  if (!addon) return false;

  const row = addon as {
    id: string;
    user_id: string;
    status: string;
    billing_cycle: AddonCycle;
  };
  if (row.status === 'pending') {
    await admin
      .from('subscription_addons')
      .update({
        status: 'active',
        provider_customer_id: providerCustomerId,
        current_period_end: addonPeriodEnd(row.billing_cycle).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    await recomputeUserAddons(admin, row.user_id);
  }
  return true;
}

/** Daily housekeeping: expire one-period add-ons whose term has ended, then
 *  re-sync the add-on counters for every affected user. Safe to run often. */
export async function reconcileAddons(admin: Admin): Promise<void> {
  const nowIso = new Date().toISOString();

  // Expire add-ons that ran their term and are not set to auto-renew.
  const { data: expired } = await admin
    .from('subscription_addons')
    .update({ status: 'expired', updated_at: nowIso })
    .eq('status', 'active')
    .eq('auto_renew', false)
    .lt('current_period_end', nowIso)
    .select('user_id');

  // Recompute counters for any user who just had an add-on expire.
  const userIds = [
    ...new Set(((expired ?? []) as { user_id: string }[]).map((r) => r.user_id)),
  ];
  for (const userId of userIds) {
    await recomputeUserAddons(admin, userId);
  }
}
