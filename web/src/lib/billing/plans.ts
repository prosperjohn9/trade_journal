// Plan catalog. Prices and limits live in code (not the DB) because they are
// not user editable and belong under version control. The subscriptions table
// only tracks which plan a user is on and its status.
//
// Final model (USD): Pro $18/mo, Elite $28/mo, Master $48/mo. Annual is two
// months free (monthly x 10). Tiers differ by synced-account count, sync
// frequency, and AI quota; every paid feature is unlocked on every tier.

export type PlanId = 'pro' | 'elite' | 'master';
export type BillingCycle = 'monthly' | 'yearly';

export type PlanDef = {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  syncedAccounts: number; // included synced (broker) accounts
  syncIntervalHours: number; // auto-sync frequency
  aiActionsPerMonth: number; // insight refreshes + trade reviews + chat turns
  blurb: string;
};

export const PLANS: Record<PlanId, PlanDef> = {
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 18,
    priceYearly: 180,
    syncedAccounts: 2,
    syncIntervalHours: 4,
    aiActionsPerMonth: 100,
    blurb: 'For traders running one or two accounts who want sync and AI.',
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    priceMonthly: 28,
    priceYearly: 280,
    syncedAccounts: 6,
    syncIntervalHours: 2,
    aiActionsPerMonth: 300,
    blurb: 'For active prop traders juggling several challenges.',
  },
  master: {
    id: 'master',
    name: 'Master',
    priceMonthly: 48,
    priceYearly: 480,
    syncedAccounts: 12,
    syncIntervalHours: 1,
    aiActionsPerMonth: 1000,
    blurb: 'For full-time traders who want the fastest sync and the most AI.',
  },
};

export const PLAN_ORDER: PlanId[] = ['pro', 'elite', 'master'];

/** Card-required trial length, in days. Full access, capped to Pro limits. */
export const TRIAL_DAYS = 7;

/** The plan whose limits a trial runs at (caps trial sync/AI cost). */
export const TRIAL_PLAN: PlanId = 'pro';

/** Pay-as-you-go price per extra synced account, per month (USD). */
export const EXTRA_SYNC_PRICE_MONTHLY = 4;

/** Absolute ceiling on synced accounts regardless of add-ons (abuse guard). */
export const MAX_SYNCED_ACCOUNTS_HARD_CAP = 50;

export function isPlanId(v: unknown): v is PlanId {
  return v === 'pro' || v === 'elite' || v === 'master';
}

export function priceFor(plan: PlanId, cycle: BillingCycle): number {
  return cycle === 'yearly' ? PLANS[plan].priceYearly : PLANS[plan].priceMonthly;
}
