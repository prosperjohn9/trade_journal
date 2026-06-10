import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  cancelSubscription,
  findActiveSubscriptionId,
} from '@/src/lib/billing/flutterwave';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan, billing_cycle, status, provider')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json(
      { error: 'No subscription to cancel.' },
      { status: 400 },
    );
  }

  // Crypto (NOWPayments) has no recurring charge to stop; only card plans need
  // the provider-side cancel. If that call fails we still mark it canceled
  // locally; the user keeps access until the period ends.
  if (sub.provider !== 'nowpayments') {
    try {
      const { data: pp } = await admin
        .from('billing_provider_plans')
        .select('provider_plan_id')
        .eq('provider', 'flutterwave')
        .eq('plan', sub.plan)
        .eq('cycle', sub.billing_cycle)
        .maybeSingle();
      if (pp?.provider_plan_id && user.email) {
        const subId = await findActiveSubscriptionId(
          user.email,
          Number(pp.provider_plan_id),
        );
        if (subId) await cancelSubscription(subId);
      }
    } catch (e) {
      console.error('Flutterwave cancel error', e);
    }
  }

  await admin
    .from('subscriptions')
    .update({
      status: 'canceled',
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
