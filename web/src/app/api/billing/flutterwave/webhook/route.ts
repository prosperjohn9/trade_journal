import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { verifyWebhookSignature } from '@/src/lib/billing/flutterwave';
import { isPlanId, type BillingCycle, type PlanId } from '@/src/lib/billing/plans';

export const runtime = 'nodejs';
export const maxDuration = 60;

type SupabaseAdmin = ReturnType<typeof createServiceClient>;

type FlwWebhookData = {
  id?: number | string;
  status?: string;
  customer?: { id?: number | string; email?: string };
  meta?: Record<string, string> | null;
};

type FlwWebhookPayload = {
  event?: string;
  data?: FlwWebhookData;
  meta?: Record<string, string> | null;
};

function addInterval(d: Date, cycle: BillingCycle): Date {
  const x = new Date(d);
  if (cycle === 'yearly') x.setUTCFullYear(x.getUTCFullYear() + 1);
  else x.setUTCMonth(x.getUTCMonth() + 1);
  return x;
}

async function handleChargeCompleted(admin: SupabaseAdmin, data: FlwWebhookData) {
  const meta = data.meta ?? {};
  const customerId =
    data.customer?.id != null ? String(data.customer.id) : null;
  const userId = meta.user_id;
  const planRaw = meta.plan;
  const cycle: BillingCycle | null =
    meta.cycle === 'yearly'
      ? 'yearly'
      : meta.cycle === 'monthly'
        ? 'monthly'
        : null;

  // Initial subscription: the checkout meta tells us exactly who and which plan.
  if (userId && isPlanId(planRaw) && cycle) {
    await admin.from('subscriptions').upsert(
      {
        user_id: userId,
        plan: planRaw as PlanId,
        status: 'active',
        billing_cycle: cycle,
        current_period_end: addInterval(new Date(), cycle).toISOString(),
        provider: 'flutterwave',
        provider_customer_id: customerId,
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    return;
  }

  // Renewal: the auto-charge carries no meta, so match the customer and extend.
  if (customerId) {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('user_id, billing_cycle')
      .eq('provider_customer_id', customerId)
      .maybeSingle();
    if (sub) {
      const cyc: BillingCycle =
        sub.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
      await admin
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_end: addInterval(new Date(), cyc).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', sub.user_id);
    }
  }
}

async function handleSubscriptionCancelled(
  admin: SupabaseAdmin,
  data: FlwWebhookData,
) {
  const customerId =
    data.customer?.id != null ? String(data.customer.id) : null;
  if (!customerId) return;
  await admin
    .from('subscriptions')
    .update({
      status: 'canceled',
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    })
    .eq('provider_customer_id', customerId);
}

export async function POST(request: Request) {
  if (!verifyWebhookSignature(request.headers.get('verif-hash'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: FlwWebhookPayload;
  try {
    payload = (await request.json()) as FlwWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const event = typeof payload.event === 'string' ? payload.event : null;
  const data = payload.data ?? {};
  const eventId = data.id != null ? String(data.id) : crypto.randomUUID();

  let admin: SupabaseAdmin;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // Idempotency: record the event first; a unique violation (23505) means we
  // already processed it, so stop.
  const { error: insErr } = await admin.from('billing_webhook_events').insert({
    provider: 'flutterwave',
    event_id: eventId,
    event_type: event,
    payload,
  });
  if (insErr) {
    if (insErr.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json(
      { error: 'Could not record event' },
      { status: 500 },
    );
  }

  try {
    if (event === 'charge.completed' && data.status === 'successful') {
      await handleChargeCompleted(admin, data);
    } else if (event === 'subscription.cancelled') {
      await handleSubscriptionCancelled(admin, data);
    }
    await admin
      .from('billing_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('provider', 'flutterwave')
      .eq('event_id', eventId);
  } catch (e) {
    // Keep returning 200 so Flutterwave does not retry forever; the raw event is
    // already stored for replay/debugging.
    console.error('Flutterwave webhook processing error', e);
  }

  return NextResponse.json({ ok: true });
}
