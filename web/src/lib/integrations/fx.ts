// FX rates so P&L can be summed across accounts in different currencies. Without
// this, a user with a USD account and a EUR account gets a meaningless blended
// number. We convert each trade's P&L into the user's display currency.
//
// Source: open.er-api.com (no key, generous free tier), rates relative to USD,
// cached 12h with last-good fallback. We use current rates (not the rate at each
// trade's close), which is the standard journal approach: an approximation, but
// far better than summing mixed currencies as if they were the same.

export type FxRates = Record<string, number>; // units of currency per 1 USD

const TTL_MS = 12 * 60 * 60 * 1000;
const FEED_URL = 'https://open.er-api.com/v6/latest/USD';

let cache: { at: number; rates: FxRates } | null = null;

export async function fetchFxRates(now: number = Date.now()): Promise<FxRates> {
  if (cache && now - cache.at < TTL_MS) return cache.rates;
  try {
    const res = await fetch(FEED_URL);
    if (!res.ok) throw new Error(`fx ${res.status}`);
    const json = (await res.json()) as { result?: string; rates?: FxRates };
    if (json.result !== 'success' || !json.rates) throw new Error('fx feed bad');
    cache = { at: now, rates: json.rates };
    return json.rates;
  } catch {
    return cache?.rates ?? {};
  }
}

/** Convert an amount between currencies via USD. If either rate is unknown (or
 *  the currencies match) the amount is returned unchanged, so an unmapped exotic
 *  degrades to no-conversion rather than zero. */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: FxRates,
): number {
  if (!from || !to || from === to) return amount;
  const rf = rates[from];
  const rt = rates[to];
  if (!rf || !rt) return amount;
  return amount * (rt / rf);
}
