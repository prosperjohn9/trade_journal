// NOWPayments integration (crypto checkout). Server-side only.
//
// Crypto cannot auto-renew like a card, so a crypto purchase is a one-time
// payment for one billing period: invoice -> hosted payment page -> IPN webhook
// confirms "finished" -> subscription activated until period end (no renewal;
// the user pays again to extend).
//
// Env: NOWPAYMENTS_API_KEY (create invoices), NOWPAYMENTS_IPN_SECRET (verify
// webhook signatures). Both from the NOWPayments dashboard.

import { createHmac, timingSafeEqual } from 'node:crypto';

const API_HOST = 'https://api.nowpayments.io/v1';

function getApiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error('Crypto payments are not configured yet.');
  return key;
}

export function isCryptoConfigured(): boolean {
  return Boolean(
    process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET,
  );
}

/** Create a hosted crypto invoice; the customer picks the coin on the hosted
 *  page. order_id carries our tx_ref so the IPN can attribute the payment. */
export async function createCryptoInvoice(params: {
  amountUsd: number;
  orderId: string;
  description: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ invoiceUrl: string; invoiceId: string }> {
  const res = await fetch(`${API_HOST}/invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount: params.amountUsd,
      price_currency: 'usd',
      order_id: params.orderId,
      order_description: params.description,
      ipn_callback_url: params.ipnCallbackUrl,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    }),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    console.error(`[nowpayments] invoice failed: ${res.status} ${raw.slice(0, 400)}`);
    throw new Error('Could not start the crypto checkout. Please try again.');
  }

  const data = (await res.json()) as { id?: number | string; invoice_url?: string };
  if (!data.invoice_url || data.id == null) {
    throw new Error('Crypto checkout did not return a payment link.');
  }
  return { invoiceUrl: data.invoice_url, invoiceId: String(data.id) };
}

/** IPN payload fields we use (the full payload is stored raw for audit). */
export type NowPaymentsIpn = {
  payment_id?: number | string;
  invoice_id?: number | string;
  payment_status?: string; // waiting|confirming|confirmed|sending|partially_paid|finished|failed|refunded|expired
  order_id?: string; // our tx_ref
  price_amount?: number;
  price_currency?: string;
  pay_currency?: string;
  actually_paid?: number;
};

/** Recursively sort object keys, per NOWPayments' documented signature scheme. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Verify the x-nowpayments-sig header: HMAC-SHA512 of the JSON body with keys
 *  sorted recursively, keyed by the IPN secret. */
export function verifyIpnSignature(
  payload: unknown,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = createHmac('sha512', secret)
    .update(JSON.stringify(sortKeysDeep(payload)))
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
