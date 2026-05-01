import type { Profile } from '@/src/domain/profile';
import { fetchAccountsByUser } from '@/src/lib/db/accounts.repo';
import { getOrCreateProfile } from '@/src/lib/db/profiles.repo';
import { fetchSetupTemplates } from '@/src/lib/db/setupTemplates.repo';
import { requireUser } from '@/src/lib/supabase/auth';
import { supabase } from '@/src/lib/supabase/client';

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
  await requireUser();

  const { profile, userId } = await getOrCreateProfile();

  const [setupTemplates, accounts] = await Promise.all([
    fetchSetupTemplates(),
    fetchAccountsByUser(userId),
  ]);

  return {
    profile,
    setupTemplates: setupTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      is_default: !!t.is_default,
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      is_default: !!a.is_default,
    })),
  };
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
  await requireUser();

  let q = supabase
    .from('trades')
    .select(
      `id, opened_at, closed_at,
       instrument, direction, outcome,
       pnl_amount, pnl_percent,
       commission, net_pnl, r_multiple,
       reviewed_at, template_id`,
    )
    .gte('opened_at', params.startIso)
    .lte('opened_at', params.endIso);

  if (params.accountId && params.accountId !== 'all') {
    q = q.eq('account_id', params.accountId);
  }
  if (params.direction) {
    q = q.eq('direction', params.direction);
  }
  if (params.outcome) {
    q = q.eq('outcome', params.outcome);
  }
  if (params.reviewedFilter === 'REVIEWED') {
    q = q.not('reviewed_at', 'is', null);
  } else if (params.reviewedFilter === 'NOT_REVIEWED') {
    q = q.is('reviewed_at', null);
  }
  if (params.setupFilter === 'NO_SETUP') {
    q = q.is('template_id', null);
  } else if (params.setupFilter) {
    q = q.eq('template_id', params.setupFilter);
  }
  if (params.instrumentQuery) {
    q = q.ilike('instrument', `%${params.instrumentQuery}%`);
  }

  const { data, error } = await q.order('opened_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as AnalyticsTrade[];
}

export async function logoutAnalytics(): Promise<void> {
  await supabase.auth.signOut();
}