// Plan catalog. Prices and limits live in code (not the DB) because they are
// not user editable and belong under version control. The subscriptions table
// only tracks which plan a user is on and its status.
//
// Final model (USD): Pro $12/mo, Elite $18/mo, Master $28/mo. Annual is two
// months free (monthly x 10). Each tier includes 1 free MetaTrader auto-sync
// account, unlimited cTrader auto-sync (free API, $0 cost to us), unlimited
// file import, and the cTrader guardrail. Extra MetaTrader sync accounts and
// the MetaTrader guardrail (Live Guard) are paid per-account add-ons. Auto-sync
// is once daily (MetaApi's 6-hour deploy billing makes anything faster
// uneconomical). Tiers differ by AI quota and manual-refresh allowance. See
// docs/sync-cost-model.md.

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
  foresightReadsPerMonth: number; // free cTrader Foresight reads/mo (MT is paid, uncapped)
  blurb: string;
};

export const PLANS: Record<PlanId, PlanDef> = {
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 12,
    priceYearly: 120,
    syncedAccounts: 1,
    syncIntervalHours: 24,
    manualRefreshesPerMonth: 14,
    aiActionsPerMonth: 40,
    foresightReadsPerMonth: 80,
    blurb: 'Free cTrader sync, 1 MetaTrader account, and AI coaching.',
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    priceMonthly: 18,
    priceYearly: 180,
    syncedAccounts: 1,
    syncIntervalHours: 24,
    manualRefreshesPerMonth: 28,
    aiActionsPerMonth: 100,
    foresightReadsPerMonth: 200,
    blurb: 'For active prop traders who want more AI and refreshes.',
  },
  master: {
    id: 'master',
    name: 'Master',
    priceMonthly: 28,
    priceYearly: 280,
    syncedAccounts: 1,
    syncIntervalHours: 24,
    manualRefreshesPerMonth: 48,
    aiActionsPerMonth: 200,
    foresightReadsPerMonth: 600,
    blurb: 'For full-time traders who want maximum AI and refreshes.',
  },
};

export const PLAN_ORDER: PlanId[] = ['pro', 'elite', 'master'];

/** Add-on: extra MetaTrader auto-sync account, per account per month (USD).
 *  Cost to us ~$3.90/account (deploy fee + hosting + amortized provisioning). */
export const EXTRA_SYNC_PRICE_MONTHLY = 6;

/** Add-on: MetaTrader Foresight (real-time AI co-pilot at trade entry), per
 *  account per month (USD). Needs an always-deployed MetaApi account (~$10/mo
 *  cost). Foresight is free on cTrader (Spotware streaming has no per-account
 *  fee), so it auto-applies to all cTrader accounts; on MetaTrader it is a paid
 *  per-account seat the user assigns. */
export const GUARDRAIL_PRICE_MONTHLY = 18;

/** Absolute ceiling on synced accounts regardless of add-ons (abuse guard). */
export const MAX_SYNCED_ACCOUNTS_HARD_CAP = 50;

export function isPlanId(v: unknown): v is PlanId {
  return v === 'pro' || v === 'elite' || v === 'master';
}

export function priceFor(plan: PlanId, cycle: BillingCycle): number {
  return cycle === 'yearly' ? PLANS[plan].priceYearly : PLANS[plan].priceMonthly;
}
