import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  createHostedPayment,
  createPaymentPlan,
} from '@/src/lib/billing/flutterwave';
import {
  PLANS,
  isPlanId,
  priceFor,
  type BillingCycle,
} from '@/src/lib/billing/plans';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FALLBACK_ORIGIN = 'https://trade-journal-beta.vercel.app';

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.email) {
    return NextResponse.json(
      { error: 'Your account has no email on file.' },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    plan?: unknown;
    cycle?: unknown;
  };
  const plan = body.plan;
  const cycle: BillingCycle = body.cycle === 'yearly' ? 'yearly' : 'monthly';
  if (!isPlanId(plan)) {
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
  }

  const amount = priceFor(plan, cycle);

  try {
    const admin = createServiceClient();

    // Reuse the Flutterwave payment plan for this (plan, cycle), or create it
    // the first time and cache its id.
    const { data: existing } = await admin
      .from('billing_provider_plans')
      .select('provider_plan_id')
      .eq('provider', 'flutterwave')
      .eq('plan', plan)
      .eq('cycle', cycle)
      .maybeSingle();

    let providerPlanId = (existing?.provider_plan_id as string | undefined) ?? '';
    if (!providerPlanId) {
      const created = await createPaymentPlan({
        name: `${PLANS[plan].name} ${cycle}`,
        amount,
        interval: cycle,
        currency: 'USD',
      });
      providerPlanId = String(created.id);
      await admin.from('billing_provider_plans').upsert(
        {
          provider: 'flutterwave',
          plan,
          cycle,
          provider_plan_id: providerPlanId,
          amount,
          currency: 'USD',
        },
        { onConflict: 'provider,plan,cycle' },
      );
    }

    const origin = request.headers.get('origin') ?? FALLBACK_ORIGIN;
    const txRef = `th-${crypto.randomUUID()}`;

    const { link } = await createHostedPayment({
      txRef,
      amount,
      currency: 'USD',
      redirectUrl: `${origin}/settings/billing?checkout=done`,
      paymentPlanId: Number(providerPlanId),
      customerEmail: user.email,
      meta: { user_id: user.id, plan, cycle },
      title: "The Trader's Hindsight",
    });

    return NextResponse.json({ link });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Checkout failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
