'use client';

import { supabase } from '@/src/lib/supabase/client';

export type BalanceEvent = {
  account_id: string;
  kind: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  occurred_at: string;
};

/** Load deposit/withdrawal events for the user, optionally scoped to one
 *  account. RLS keeps it to the current user. Used by the equity curve. */
export async function loadBalanceEvents(
  accountId?: string,
): Promise<BalanceEvent[]> {
  let query = supabase
    .from('account_balance_events')
    .select('account_id, kind, amount, occurred_at');
  if (accountId && accountId !== 'all') {
    query = query.eq('account_id', accountId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as BalanceEvent[] | null) ?? [];
}
