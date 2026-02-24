import type { Profile } from '@/src/domain/profile';
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

export async function loadAnalyticsBootstrap(): Promise<{
  profile: Profile;
  setupTemplates: AnalyticsSetupTemplate[];
}> {
  await requireUser();

  const [{ profile }, setupTemplates] = await Promise.all([
    getOrCreateProfile(),
    fetchSetupTemplates(),
  ]);

  return {
    profile,
    setupTemplates: setupTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      is_default: !!t.is_default,
    })),
  };
}

export async function loadAnalyticsTradesInRange(params: {
  startIso: string;
  endIso: string;
}): Promise<AnalyticsTrade[]> {
  await requireUser();

  const { data, error } = await supabase
    .from('trades')
    .select(
      `id, opened_at, closed_at,
       instrument, direction, outcome,
       pnl_amount, pnl_percent,
       commission, net_pnl, r_multiple,
       reviewed_at, template_id`,
    )
    .gte('opened_at', params.startIso)
    .lte('opened_at', params.endIso)
    .order('opened_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as AnalyticsTrade[];
}

export async function logoutAnalytics(): Promise<void> {
  await supabase.auth.signOut();
}
