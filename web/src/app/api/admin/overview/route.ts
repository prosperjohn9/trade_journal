import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';
import { PLANS, type PlanId } from '@/src/lib/billing/plans';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /api/admin/overview
//
// Founder-only metrics: users, subscriptions, MRR estimate, usage counters,
// recent signups. Gated by ADMIN_EMAILS (comma-separated env var); everyone
// else gets a 403 and the underlying queries use the service role only after
// that check passes.

function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

const LIFETIME_MS = 3650 * 86_400_000; // >10y out = comp/lifetime, not revenue

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
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const monthStart = startOfMonthIso();

  const [
    usersRes,
    subsRes,
    tradesRes,
    connectionsRes,
    aiMonthRes,
    refreshesMonthRes,
  ] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('subscriptions').select(`user_id, ${SUBSCRIPTION_SELECT}`),
    admin.from('trades').select('id', { count: 'exact', head: true }),
    admin.from('mt_connections').select('id', { count: 'exact', head: true }),
    admin
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart),
    admin
      .from('mt_refreshes')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart),
  ]);

  const users = usersRes.data?.users ?? [];
  const subs = (subsRes.data ?? []) as Array<SubscriptionRow & { user_id: string }>;
  const subByUser = new Map(subs.map((s) => [s.user_id, s]));

  const now = Date.now();
  const planCounts: Record<PlanId, number> = { pro: 0, elite: 0, master: 0 };
  let entitledCount = 0;
  let lifetimeCount = 0;
  let mrr = 0;

  for (const s of subs) {
    const ent = resolveEntitlements(s, now);
    if (!ent.entitled || !ent.plan) continue;
    entitledCount++;
    planCounts[ent.plan]++;
    const periodEnd = s.current_period_end
      ? new Date(s.current_period_end).getTime()
      : 0;
    if (periodEnd - now > LIFETIME_MS) {
      lifetimeCount++; // comp/lifetime: entitled but not revenue
      continue;
    }
    const def = PLANS[ent.plan];
    mrr += s.billing_cycle === 'yearly' ? def.priceYearly / 12 : def.priceMonthly;
  }

  const recentSignups = [...users]
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime(),
    )
    .slice(0, 15)
    .map((u) => {
      const s = subByUser.get(u.id);
      const ent = s ? resolveEntitlements(s, now) : null;
      return {
        email: u.email ?? '(no email)',
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        plan: ent?.entitled ? ent.plan : null,
        status: s?.status ?? null,
      };
    });

  return NextResponse.json({
    totals: {
      users: users.length,
      entitledSubscriptions: entitledCount,
      lifetimeComps: lifetimeCount,
      mrr: Math.round(mrr * 100) / 100,
      trades: tradesRes.count ?? 0,
      brokerConnections: connectionsRes.count ?? 0,
      aiActionsThisMonth: aiMonthRes.count ?? 0,
      brokerRefreshesThisMonth: refreshesMonthRes.count ?? 0,
    },
    planCounts,
    recentSignups,
  });
}
