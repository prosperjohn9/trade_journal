// Flutterwave v3 API helpers. Server-only (uses the secret key). Docs:
// https://developer.flutterwave.com/docs

const FLW_BASE = 'https://api.flutterwave.com/v3';

function secretKey(): string {
  const k = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!k) throw new Error('FLUTTERWAVE_SECRET_KEY is not configured.');
  return k;
}

async function flwFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FLW_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
  };
  if (!res.ok || json.status === 'error') {
    throw new Error(
      json.message || `Flutterwave ${path} failed (HTTP ${res.status}).`,
    );
  }
  return json as T;
}

export type FlwInterval = 'monthly' | 'yearly';

export type FlwPaymentPlan = {
  id: number;
  name: string;
  amount: number;
  interval: string;
  currency: string;
  status: string;
};

/** Create a recurring payment plan. Flutterwave auto-debits the saved card each
 *  interval once a customer pays against this plan. */
export async function createPaymentPlan(params: {
  name: string;
  amount: number;
  interval: FlwInterval;
  currency: string;
}): Promise<FlwPaymentPlan> {
  const json = await flwFetch<{ data: FlwPaymentPlan }>('/payment-plans', {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      amount: params.amount,
      interval: params.interval,
      currency: params.currency,
    }),
  });
  return json.data;
}

/** Create a hosted (redirect) payment tied to a plan. Returns the pay link. */
export async function createHostedPayment(params: {
  txRef: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  paymentPlanId: number;
  customerEmail: string;
  customerName?: string;
  meta: Record<string, string>;
  title?: string;
}): Promise<{ link: string }> {
  const json = await flwFetch<{ data: { link: string } }>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      tx_ref: params.txRef,
      amount: params.amount,
      currency: params.currency,
      redirect_url: params.redirectUrl,
      payment_plan: params.paymentPlanId,
      customer: { email: params.customerEmail, name: params.customerName },
      customizations: { title: params.title ?? "The Trader's Hindsight" },
      meta: params.meta,
    }),
  });
  return { link: json.data.link };
}

/** Create a hosted (redirect) one-time payment, with no recurring plan. Used
 *  for one-period add-on purchases. Returns the pay link. */
export async function createOneTimePayment(params: {
  txRef: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  customerEmail: string;
  meta: Record<string, string>;
  title?: string;
}): Promise<{ link: string }> {
  const json = await flwFetch<{ data: { link: string } }>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      tx_ref: params.txRef,
      amount: params.amount,
      currency: params.currency,
      redirect_url: params.redirectUrl,
      customer: { email: params.customerEmail },
      customizations: { title: params.title ?? "The Trader's Hindsight" },
      meta: params.meta,
    }),
  });
  return { link: json.data.link };
}

export type FlwVerifyData = {
  status: string; // 'successful' on success
  amount: number;
  currency: string;
  tx_ref: string;
  customer: { id: number; email: string; name?: string };
  meta?: Record<string, string> | null;
  payment_plan?: number | null;
};

export async function verifyTransaction(
  id: string | number,
): Promise<FlwVerifyData> {
  const json = await flwFetch<{ data: FlwVerifyData }>(
    `/transactions/${id}/verify`,
    { method: 'GET' },
  );
  return json.data;
}

type FlwSubscriptionRow = {
  id: number;
  plan: number;
  status: string;
  customer?: { customer_email?: string };
};

/** Find the active Flutterwave subscription id for a customer + plan, for
 *  cancellation. Flutterwave does not return the subscription id on the charge
 *  webhook, so we look it up by email. */
export async function findActiveSubscriptionId(
  email: string,
  planId: number,
): Promise<number | null> {
  const json = await flwFetch<{ data: FlwSubscriptionRow[] }>(
    `/subscriptions?email=${encodeURIComponent(email)}`,
    { method: 'GET' },
  );
  const match = (json.data ?? []).find(
    (s) => s.plan === planId && s.status === 'active',
  );
  return match?.id ?? null;
}

export async function cancelSubscription(id: number): Promise<void> {
  await flwFetch(`/subscriptions/${id}/cancel`, { method: 'PUT' });
}

/** Flutterwave posts the dashboard "secret hash" in the verif-hash header. */
export function verifyWebhookSignature(headerHash: string | null): boolean {
  const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  return Boolean(expected) && headerHash === expected;
}
