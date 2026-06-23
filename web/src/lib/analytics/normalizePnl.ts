// Converts a trade's P&L (denominated in its account's currency) into the user's
// display currency, so cross-account aggregates stop blending currencies. Loads
// the user's account currencies + FX rates once; falls back to identity when an
// account or rate is unknown (so single-currency users are a pure no-op).

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchFxRates, convertAmount } from '@/src/lib/integrations/fx';

export type PnlNormalizer = {
  displayCurrency: string;
  /** Convert a P&L value from its account's currency to the display currency. */
  toDisplay: (pnl: number, accountId: string | null) => number;
};

export async function buildPnlNormalizer(
  sb: SupabaseClient,
  userId: string,
  displayCurrency: string,
): Promise<PnlNormalizer> {
  const [{ data: accts }, rates] = await Promise.all([
    sb.from('accounts').select('id, base_currency').eq('user_id', userId),
    fetchFxRates(),
  ]);
  const ccyByAccount = new Map<string, string>();
  for (const a of (accts ?? []) as Array<{
    id: string;
    base_currency: string | null;
  }>) {
    ccyByAccount.set(a.id, a.base_currency ?? displayCurrency);
  }
  return {
    displayCurrency,
    toDisplay: (pnl, accountId) => {
      const from = accountId
        ? (ccyByAccount.get(accountId) ?? displayCurrency)
        : displayCurrency;
      return convertAmount(pnl, from, displayCurrency, rates);
    },
  };
}
