// Plan catalog. Prices and limits live in code (not the DB) because they are
// not user editable and belong under version control. The subscriptions table
// only tracks which plan a user is on and its status.
//
// Final model (USD): Pro $18/mo, Elite $28/mo, Master $48/mo. Annual is two
// months free (monthly x 10). Auto-sync is once daily on every tier (MetaApi's
// 6-hour deploy billing makes anything faster uneconomical); tiers differ by
// synced-account count, AI quota, and manual-refresh allowance. Every paid
// feature is unlocked on every tier. See docs/sync-cost-model.md.

export type PlanId = 'pro' | 'elite' | 'master';
export type BillingCycle = 'monthly' | 'yearly';

export type PlanDef = {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  syncedAccounts: number; // included synced (broker) accounts
  syncIntervalHours: number; // auto-sync cadence (24 = once daily)
  manualRefreshesPerMonth: number; // user-triggered "refresh now" allowance
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
    syncIntervalHours: 24,
    manualRefreshesPerMonth: 14,
    aiActionsPerMonth: 40,
    blurb: 'For traders running one or two accounts who want sync and AI.',
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    priceMonthly: 28,
    priceYearly: 280,
    syncedAccounts: 4,
    syncIntervalHours: 24,
    manualRefreshesPerMonth: 28,
    aiActionsPerMonth: 100,
    blurb: 'For active prop traders juggling several challenges.',
  },
  master: {
    id: 'master',
    name: 'Master',
    priceMonthly: 48,
    priceYearly: 480,
    syncedAccounts: 8,
    syncIntervalHours: 24,
    manualRefreshesPerMonth: 48,
    aiActionsPerMonth: 200,
    blurb: 'For full-time traders running a book of accounts.',
  },
};

export const PLAN_ORDER: PlanId[] = ['pro', 'elite', 'master'];

/** Card-required trial length, in days. Full access, capped to Pro limits. */
export const TRIAL_DAYS = 7;

/** The plan whose limits a trial runs at (caps trial sync/AI cost). */
export const TRIAL_PLAN: PlanId = 'pro';

/** Pay-as-you-go price per extra synced account, per month (USD). */
export const EXTRA_SYNC_PRICE_MONTHLY = 6;

/** Absolute ceiling on synced accounts regardless of add-ons (abuse guard). */
export const MAX_SYNCED_ACCOUNTS_HARD_CAP = 50;

export function isPlanId(v: unknown): v is PlanId {
  return v === 'pro' || v === 'elite' || v === 'master';
}

export function priceFor(plan: PlanId, cycle: BillingCycle): number {
  return cycle === 'yearly' ? PLANS[plan].priceYearly : PLANS[plan].priceMonthly;
}
