import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  verifyIpnSignature,
  type NowPaymentsIpn,
} from '@/src/lib/billing/nowpayments';
import { isPlanId, type BillingCycle } from '@/src/lib/billing/plans';
import { activateAddonByTxRef } from '@/src/lib/billing/addons';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/billing/nowpayments/webhook
//
// NOWPayments IPN. Fires on every payment status change; we activate on
// "finished" (funds fully settled). Crypto has no auto-renewal, so activation
// grants one billing period; paying again extends it. Auth: HMAC-SHA512
// signature in x-nowpayments-sig keyed by NOWPAYMENTS_IPN_SECRET.

type SupabaseAdmin = ReturnType<typeof createServiceClient>;

function addInterval(d: Date, cycle: BillingCycle): Date {
  const x = new Date(d);
  if (cycle === 'yearly') x.setUTCFullYear(x.getUTCFullYear() + 1);
  else x.setUTCMonth(x.getUTCMonth() + 1);
  return x;
}

async function handleFinished(admin: SupabaseAdmin, ipn: NowPaymentsIpn) {
  const orderId = typeof ipn.order_id === 'string' ? ipn.order_id : null;
  if (!orderId) return;

  // Add-on purchases reuse this IPN; activate and stop if it is one.
  if (await activateAddonByTxRef(admin, orderId, null)) return;

  const { data: co } = await admin
    .from('billing_checkouts')
    .select('user_id, plan, cycle')
    .eq('tx_ref', orderId)
    .maybeSingle();
  if (!co || !isPlanId(co.plan)) return;

  const cycle: BillingCycle = co.cycle === 'yearly' ? 'yearly' : 'monthly';

  // Fair extension: paying again for the same plan before the current period
  // lapses extends from the period end, not from today.
  const { data: existing } = await admin
    .from('subscriptions')
    .select('plan, current_period_end')
    .eq('user_id', co.user_id)
    .maybeSingle();
  const now = new Date();
  const base =
    existing &&
    existing.plan === co.plan &&
    existing.current_period_end &&
    new Date(existing.current_period_end) > now
      ? new Date(existing.current_period_end)
      : now;

  await admin.from('subscriptions').upsert(
    {
      user_id: co.user_id,
      plan: co.plan,
      status: 'active',
      billing_cycle: cycle,
      current_period_end: addInterval(base, cycle).toISOString(),
      provider: 'nowpayments',
      provider_customer_id: null,
      provider_subscription_id:
        ipn.payment_id != null ? String(ipn.payment_id) : null,
      // No auto-renewal in crypto: access simply ends unless they pay again.
      cancel_at_period_end: true,
      updated_at: now.toISOString(),
    },
    { onConflict: 'user_id' },
  );
}

export async function POST(request: Request) {
  let payload: NowPaymentsIpn;
  try {
    payload = (await request.json()) as NowPaymentsIpn;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!verifyIpnSignature(payload, request.headers.get('x-nowpayments-sig'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let admin: SupabaseAdmin;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const status = String(payload.payment_status ?? '').toLowerCase();
  // One IPN per status change, so the idempotency key includes the status.
  const eventId = `${payload.payment_id ?? payload.invoice_id ?? crypto.randomUUID()}:${status}`;

  const { error: insErr } = await admin.from('billing_webhook_events').insert({
    provider: 'nowpayments',
    event_id: eventId,
    event_type: status ? `payment:${status}` : null,
    payload,
  });
  if (insErr) {
    if (insErr.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
  }

  try {
    if (status === 'finished') {
      await handleFinished(admin, payload);
    }
    // partially_paid / expired / failed: stored above for support follow-up;
    // nothing is activated.
    await admin
      .from('billing_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('provider', 'nowpayments')
      .eq('event_id', eventId);
  } catch (e) {
    // Return 200 so NOWPayments does not retry forever; the raw event is stored
    // for replay/debugging.
    console.error('NOWPayments webhook processing error', e);
  }

  return NextResponse.json({ ok: true });
}
