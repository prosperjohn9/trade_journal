// Pure entitlement resolver. Given a user's subscription row (or null), it
// decides what they may do right now. Used on both the client (paywall UI) and
// the server (real enforcement on the costly endpoints).
//
// Access rules:
//   trialing  -> entitled while now < trial_ends_at; runs at Pro limits.
//   active    -> entitled while now < current_period_end.
//   past_due  -> still entitled until current_period_end (grace, no hard cutoff
//                mid-cycle on a failed renewal).
//   canceled  -> entitled until current_period_end (they keep what they paid
//                for), then locked.
//   expired / none -> locked: view existing data only, every paid feature off.

import { PLANS, TRIAL_PLAN, type PlanId } from './plans';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired';

export type SubscriptionRow = {
  plan: PlanId;
  status: SubscriptionStatus;
  billing_cycle: 'monthly' | 'yearly';
  extra_synced_accounts: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type EntitlementLimits = {
  syncedAccounts: number;
  syncIntervalHours: number;
  manualRefreshesPerMonth: number;
  aiActionsPerMonth: number;
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
  isTrial: boolean;
  trialEndsAt: string | null;
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
    isTrial: false,
    trialEndsAt: sub?.trial_ends_at ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    daysLeft: null,
    limits: { ...LOCKED_LIMITS },
    features: { ...LOCKED_FEATURES },
  };

  if (!sub) return locked;

  const isTrial = sub.status === 'trialing';
  const trialOk = isTrial && before(sub.trial_ends_at, now);
  const paidOk =
    (sub.status === 'active' ||
      sub.status === 'past_due' ||
      sub.status === 'canceled') &&
    before(sub.current_period_end, now);

  if (!trialOk && !paidOk) return locked;

  // Trials run at Pro-level limits to bound sync/AI cost; paid users get their
  // plan's limits plus any pay-as-you-go synced accounts.
  const effectivePlanId: PlanId = isTrial ? TRIAL_PLAN : sub.plan;
  const plan = PLANS[effectivePlanId];
  const extra = isTrial ? 0 : Math.max(0, sub.extra_synced_accounts || 0);

  return {
    entitled: true,
    status: sub.status,
    plan: effectivePlanId,
    isTrial,
    trialEndsAt: sub.trial_ends_at,
    currentPeriodEnd: sub.current_period_end,
    daysLeft: daysUntil(isTrial ? sub.trial_ends_at : sub.current_period_end, now),
    limits: {
      syncedAccounts: plan.syncedAccounts + extra,
      syncIntervalHours: plan.syncIntervalHours,
      manualRefreshesPerMonth: plan.manualRefreshesPerMonth,
      aiActionsPerMonth: plan.aiActionsPerMonth,
    },
    features: { ...ALL_FEATURES },
  };
}

/** Columns to select for entitlement resolution. */
export const SUBSCRIPTION_SELECT =
  'plan, status, billing_cycle, extra_synced_accounts, trial_ends_at, current_period_end, cancel_at_period_end';
