// Pure entitlement resolver. Given a user's subscription row (or null), it
// decides what they may do right now. Used on both the client (paywall UI) and
// the server (real enforcement on the costly endpoints).
//
// Access rules:
//   active    -> entitled while now < current_period_end.
//   past_due  -> still entitled until current_period_end (grace, no hard cutoff
//                mid-cycle on a failed renewal).
//   canceled  -> entitled until current_period_end (they keep what they paid
//                for), then locked.
//   expired / none -> locked: view existing data only, every paid feature off.

import { PLANS, type PlanId } from './plans';

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired';

export type SubscriptionRow = {
  plan: PlanId;
  status: SubscriptionStatus;
  billing_cycle: 'monthly' | 'yearly';
  extra_synced_accounts: number;
  guardrail_seats: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type EntitlementLimits = {
  syncedAccounts: number;
  syncIntervalHours: number;
  manualRefreshesPerMonth: number;
  aiActionsPerMonth: number;
  /** How many MetaTrader accounts the user may turn real-time Foresight on for
   *  (paid per-account seats). cTrader Foresight is free and not counted here. */
  guardrailSeats: number;
  /** Monthly abuse ceiling on FREE cTrader Foresight reads only. MetaTrader
   *  Foresight is a paid per-account seat and is never capped. Not a target. */
  foresightReadsPerMonth: number;
};

export type EntitlementFeatures = {
  sync: boolean;
  ai: boolean;
  propTracking: boolean;
  advancedAnalytics: boolean;
};

export type Entitlements = {
  entitled: boolean;
  status: SubscriptionStatus | 'none';
  plan: PlanId | null; // effective plan used for limits
  currentPeriodEnd: string | null;
  daysLeft: number | null;
  limits: EntitlementLimits;
  features: EntitlementFeatures;
};

const LOCKED_LIMITS: EntitlementLimits = {
  syncedAccounts: 0,
  syncIntervalHours: 0,
  manualRefreshesPerMonth: 0,
  aiActionsPerMonth: 0,
  guardrailSeats: 0,
  foresightReadsPerMonth: 0,
};

const LOCKED_FEATURES: EntitlementFeatures = {
  sync: false,
  ai: false,
  propTracking: false,
  advancedAnalytics: false,
};

const ALL_FEATURES: EntitlementFeatures = {
  sync: true,
  ai: true,
  propTracking: true,
  advancedAnalytics: true,
};

function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function before(iso: string | null, now: number): boolean {
  return iso != null && now < new Date(iso).getTime();
}

export function resolveEntitlements(
  sub: SubscriptionRow | null,
  now: number = Date.now(),
): Entitlements {
  const locked: Entitlements = {
    entitled: false,
    status: sub?.status ?? 'none',
    plan: null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    daysLeft: null,
    limits: { ...LOCKED_LIMITS },
    features: { ...LOCKED_FEATURES },
  };

  if (!sub) return locked;

  const paidOk =
    (sub.status === 'active' ||
      sub.status === 'past_due' ||
      sub.status === 'canceled') &&
    before(sub.current_period_end, now);

  if (!paidOk) return locked;

  // Paid users get their plan's limits plus any pay-as-you-go synced accounts.
  const plan = PLANS[sub.plan];
  const extra = Math.max(0, sub.extra_synced_accounts || 0);

  return {
    entitled: true,
    status: sub.status,
    plan: sub.plan,
    currentPeriodEnd: sub.current_period_end,
    daysLeft: daysUntil(sub.current_period_end, now),
    limits: {
      syncedAccounts: plan.syncedAccounts + extra,
      syncIntervalHours: plan.syncIntervalHours,
      manualRefreshesPerMonth: plan.manualRefreshesPerMonth,
      aiActionsPerMonth: plan.aiActionsPerMonth,
      guardrailSeats: Math.max(0, sub.guardrail_seats || 0),
      foresightReadsPerMonth: plan.foresightReadsPerMonth,
    },
    features: { ...ALL_FEATURES },
  };
}

/** Full-access entitlements for the owner/admin: unlimited synced accounts and
 *  every feature, no subscription required. Kept here so the cap math, gating,
 *  and quota checks all read from one definition. */
export function adminEntitlements(): Entitlements {
  return {
    entitled: true,
    status: 'active',
    plan: 'master',
    currentPeriodEnd: null,
    daysLeft: null,
    limits: {
      syncedAccounts: 999,
      syncIntervalHours: PLANS.master.syncIntervalHours,
      manualRefreshesPerMonth: 99_999,
      aiActionsPerMonth: 99_999,
      guardrailSeats: 999,
      foresightReadsPerMonth: 999_999,
    },
    features: { ...ALL_FEATURES },
  };
}

/** Columns to select for entitlement resolution. */
export const SUBSCRIPTION_SELECT =
  'plan, status, billing_cycle, extra_synced_accounts, guardrail_seats, current_period_end, cancel_at_period_end';
