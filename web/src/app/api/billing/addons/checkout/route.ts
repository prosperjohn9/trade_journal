import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { createOneTimePayment } from '@/src/lib/billing/flutterwave';
import { createCryptoInvoice } from '@/src/lib/billing/nowpayments';
import {
  addonAmount,
  addonUnitPrice,
  isAddonKind,
  type AddonCycle,
  type AddonKind,
} from '@/src/lib/billing/addons';
import { MAX_SYNCED_ACCOUNTS_HARD_CAP } from '@/src/lib/billing/plans';
import { resolveEntitlements, SUBSCRIPTION_SELECT } from '@/src/lib/billing/entitlements';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FALLBACK_ORIGIN = 'https://tradershindsight.com';

// POST /api/billing/addons/checkout
//
// Body: { kind: 'mt_sync', quantity, cycle: 'monthly'|'yearly', method: 'card'|'crypto' }
//
// One-period add-on purchase. Records a pending subscription_addons row keyed by
// tx_ref; the payment webhook activates it and bumps extra_synced_accounts.

export async function POST(request: Request) {
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
  if (!user.email) {
    return NextResponse.json(
      { error: 'Your account has no email on file.' },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    quantity?: unknown;
    cycle?: unknown;
    method?: unknown;
  };
  const kind: AddonKind | null = isAddonKind(body.kind) ? body.kind : null;
  const quantity = Number(body.quantity);
  const cycle: AddonCycle = body.cycle === 'yearly' ? 'yearly' : 'monthly';
  const method = body.method === 'crypto' ? 'crypto' : 'card';

  if (!kind) {
    return NextResponse.json({ error: 'Unknown add-on.' }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return NextResponse.json(
      { error: 'Choose a quantity between 1 and 20.' },
      { status: 400 },
    );
  }

  // Add-ons require an active base subscription, and cannot push the user past
  // the hard account ceiling.
  const { data: subRow } = await sb
    .from('subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('user_id', user.id)
    .maybeSingle();
  const ent = resolveEntitlements(subRow ?? null);
  if (!ent.entitled) {
    return NextResponse.json(
      { error: 'Start a plan before buying add-ons.' },
      { status: 403 },
    );
  }
  // The synced-account ceiling only bounds extra-sync purchases; guardrail
  // seats are not synced accounts, so that ceiling does not apply to them.
  if (
    kind === 'mt_sync' &&
    ent.limits.syncedAccounts + quantity > MAX_SYNCED_ACCOUNTS_HARD_CAP
  ) {
    return NextResponse.json(
      { error: `That exceeds the ${MAX_SYNCED_ACCOUNTS_HARD_CAP}-account ceiling.` },
      { status: 400 },
    );
  }

  const amount = addonAmount(kind, quantity, cycle);

  try {
    const admin = createServiceClient();
    const origin = request.headers.get('origin') ?? FALLBACK_ORIGIN;
    const txRef = `th-addon-${crypto.randomUUID()}`;

    await admin.from('subscription_addons').insert({
      user_id: user.id,
      kind,
      quantity,
      unit_price_usd: addonUnitPrice(kind),
      billing_cycle: cycle,
      auto_renew: false,
      status: 'pending',
      provider: method === 'crypto' ? 'nowpayments' : 'flutterwave',
      tx_ref: txRef,
    });

    const label =
      kind === 'guardrail'
        ? `${quantity} Foresight seat${quantity === 1 ? '' : 's'}`
        : `${quantity} extra MetaTrader account${quantity === 1 ? '' : 's'}`;

    if (method === 'crypto') {
      const { invoiceUrl } = await createCryptoInvoice({
        amount,
        orderId: txRef,
        description: `The Trader's Hindsight add-on: ${label} (${cycle})`,
        ipnCallbackUrl: `${FALLBACK_ORIGIN}/api/billing/nowpayments/webhook`,
        successUrl: `${origin}/settings/billing?checkout=done&status=successful&method=crypto`,
        cancelUrl: `${origin}/settings/billing?checkout=done&status=cancelled&method=crypto`,
      });
      return NextResponse.json({ link: invoiceUrl });
    }

    const { link } = await createOneTimePayment({
      txRef,
      amount,
      currency: 'USD',
      redirectUrl: `${origin}/settings/billing?checkout=done`,
      customerEmail: user.email,
      meta: { user_id: user.id, addon: kind, quantity: String(quantity) },
      title: "The Trader's Hindsight add-on",
    });
    return NextResponse.json({ link });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Checkout failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
