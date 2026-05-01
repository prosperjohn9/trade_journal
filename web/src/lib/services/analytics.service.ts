'use client';

import type { Profile } from '@/src/domain/profile';
import { supabase } from '@/src/lib/supabase/client';
import { apiFetch, buildQuery } from '@/src/lib/api/fetcher';

export type AnalyticsTrade = {
  id: string;
  opened_at: string;
  closed_at: string | null;

  instrument: string;
  direction: 'BUY' | 'SELL';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';

  pnl_amount: number;
  pnl_percent: number;

  commission: number | null;
  net_pnl: number | null;
  r_multiple: number | null;

  reviewed_at: string | null;
  template_id: string | null;
};

export type AnalyticsSetupTemplate = {
  id: string;
  name: string;
  is_default: boolean;
};

export type AnalyticsAccount = {
  id: string;
  name: string;
  is_default: boolean;
};

export async function loadAnalyticsBootstrap(): Promise<{
  profile: Profile;
  setupTemplates: AnalyticsSetupTemplate[];
  accounts: AnalyticsAccount[];
}> {
  return apiFetch('/api/analytics/bootstrap');
}

export async function loadAnalyticsTradesInRange(params: {
  startIso: string;
  endIso: string;
  accountId?: string | 'all';
  direction?: string;
  outcome?: string;
  reviewedFilter?: '' | 'REVIEWED' | 'NOT_REVIEWED';
  setupFilter?: string;
  instrumentQuery?: string;
}): Promise<AnalyticsTrade[]> {
  const qs = buildQuery({
    startIso: params.startIso,
    endIso: params.endIso,
    accountId: params.accountId,
    direction: params.direction,
    outcome: params.outcome,
    reviewedFilter: params.reviewedFilter,
    setupFilter: params.setupFilter,
    instrumentQuery: params.instrumentQuery,
  });
  return apiFetch(`/api/analytics/trades${qs}`);
}

export async function logoutAnalytics(): Promise<void> {
  await supabase.auth.signOut();
}
