import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  verifyTransaction,
  verifyWebhookSignature,
} from '@/src/lib/billing/flutterwave';
import { isPlanId, type BillingCycle } from '@/src/lib/billing/plans';
import { activateAddonByTxRef } from '@/src/lib/billing/addons';

export const runtime = 'nodejs';
export const maxDuration = 60;

type SupabaseAdmin = ReturnType<typeof createServiceClient>;

// Flutterwave sends either the v3 shape ({ event, data }) or a flat legacy shape
// ({ id, status, txRef, customer, ... }). We read defensively from both.
type FlwParty = { id?: number | string; email?: string };
type FlwWebhookPayload = {
  event?: string;
  data?: {
    id?: number | string;
    status?: string;
    customer?: FlwParty;
  };
  id?: number | string;
  status?: string;
  flwRef?: string;
  customer?: FlwParty;
};

function addInterval(d: Date, cycle: BillingCycle): Date {
  const x = new Date(d);
  if (cycle === 'yearly') x.setUTCFullYear(x.getUTCFullYear() + 1);
  else x.setUTCMonth(x.getUTCMonth() + 1);
  return x;
}

async function handleChargeCompleted(
  admin: SupabaseAdmin,
  txId: number | string,
) {
  // Verify with Flutterwave rather than trusting the webhook body. The verify
  // response is the source of truth for status, tx_ref, and the customer.
  const verified = await verifyTransaction(txId);
  if (verified.status !== 'successful') return;

  const customerId =
    verified.customer?.id != null ? String(verified.customer.id) : null;

  // Add-on purchases reuse this webhook; activate and stop if it is one.
  if (await activateAddonByTxRef(admin, verified.tx_ref, customerId)) return;

  // Attribute the charge to a user via the checkout we recorded by tx_ref.
  const { data: co } = await admin
    .from('billing_checkouts')
    .select('user_id, plan, cycle')
    .eq('tx_ref', verified.tx_ref)
    .maybeSingle();

  if (co && isPlanId(co.plan)) {
    const cycle: BillingCycle = co.cycle === 'yearly' ? 'yearly' : 'monthly';
    await admin.from('subscriptions').upsert(
      {
        user_id: co.user_id,
        plan: co.plan,
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

  // Renewal (auto-charge has no checkout row): match the customer and extend.
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
  payload: FlwWebhookPayload,
) {
  const party = payload.data?.customer ?? payload.customer;
  const customerId = party?.id != null ? String(party.id) : null;
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
  const txId = payload.data?.id ?? payload.id ?? null;
  const status = String(payload.data?.status ?? payload.status ?? '').toLowerCase();
  const eventId =
    txId != null
      ? String(txId)
      : typeof payload.flwRef === 'string'
        ? payload.flwRef
        : crypto.randomUUID();

  let admin: SupabaseAdmin;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // Idempotency: record the event; a unique violation (23505) means we already
  // processed it, so stop.
  const { error: insErr } = await admin.from('billing_webhook_events').insert({
    provider: 'flutterwave',
    event_id: eventId,
    event_type: event ?? (status ? `status:${status}` : null),
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
    const isCharge = event === 'charge.completed' || status === 'successful';
    if (isCharge && txId != null) {
      await handleChargeCompleted(admin, txId);
    } else if (event === 'subscription.cancelled') {
      await handleSubscriptionCancelled(admin, payload);
    }
    await admin
      .from('billing_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('provider', 'flutterwave')
      .eq('event_id', eventId);
  } catch (e) {
    // Keep returning 200 so Flutterwave does not retry forever; the raw event is
    // stored for replay/debugging.
    console.error('Flutterwave webhook processing error', e);
  }

  return NextResponse.json({ ok: true });
}
