import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { getServerEntitlements } from '@/src/lib/billing/server';
import { monthlyUsageCount } from '@/src/lib/ai/usage';
import { manualRefreshCount } from '@/src/lib/integrations/sync';
import { ctraderReadUsage } from '@/src/lib/analytics/foresightCap';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /api/billing/usage
//
// The caller's quota consumption for the current month plus how their plan
// ends/renews. Powers the usage meters on the billing page and the plan-expiry
// banner on the dashboard. Read-only and cheap (three counts under RLS).

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [entitlements, aiUsed, refreshesUsed, foresight, { data: sub }] =
    await Promise.all([
      getServerEntitlements(sb),
      monthlyUsageCount(sb, user.id),
      manualRefreshCount(sb, user.id),
      ctraderReadUsage(sb, user.id),
      sb
        .from('subscriptions')
        .select('cancel_at_period_end, provider, status')
        .maybeSingle(),
    ]);

  const row = (sub ?? null) as {
    cancel_at_period_end?: boolean;
    provider?: string | null;
    status?: string;
  } | null;

  const lifetime =
    entitlements.daysLeft != null && entitlements.daysLeft > 3650;
  // Renewal happens only for active card subscriptions that are not set to
  // cancel; crypto plans (cancel_at_period_end) and canceled plans just end.
  const willRenew =
    entitlements.entitled &&
    !lifetime &&
    row?.status === 'active' &&
    !row?.cancel_at_period_end;

  return NextResponse.json({
    entitled: entitlements.entitled,
    plan: entitlements.plan,
    aiUsed,
    aiLimit: entitlements.limits.aiActionsPerMonth,
    refreshesUsed,
    refreshesLimit: entitlements.limits.manualRefreshesPerMonth,
    foresightUsed: foresight.used,
    foresightLimit: foresight.cap,
    hasForesight: foresight.hasCtrader,
    daysLeft: lifetime ? null : entitlements.daysLeft,
    endsAt: lifetime ? null : entitlements.currentPeriodEnd,
    willRenew,
    provider: row?.provider ?? null,
  });
}
