// Server helper: load the trader's resolved Foresight reads (with each read's
// account currency) and compute their per-signal calibration. Pure aggregation +
// row mapping live in lib/analytics/calibration.ts; this is just the fetch.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeCalibration,
  rowsToCalReads,
  type RawReadRow,
  type SignalStat,
} from '@/src/lib/analytics/calibration';

type ReadRow = {
  signals: unknown;
  outcome: unknown;
  closed_pnl: unknown;
  account_id: string | null;
};
type AcctRow = { id: string; base_currency: string | null };

/** Fetch this trader's resolved reads and compute their per-signal record, with
 *  net P&L kept per account currency. */
export async function loadCalibration(
  sb: SupabaseClient,
  userId: string,
): Promise<Map<string, SignalStat>> {
  const [{ data: reads }, { data: accts }] = await Promise.all([
    sb
      .from('foresight_reads')
      .select('signals, outcome, closed_pnl, account_id')
      .eq('user_id', userId)
      .not('outcome', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000),
    sb.from('accounts').select('id, base_currency').eq('user_id', userId),
  ]);
  const ccy = new Map<string, string>();
  for (const a of (accts ?? []) as AcctRow[])
    ccy.set(a.id, a.base_currency ?? 'USD');
  const rows: RawReadRow[] = ((reads ?? []) as ReadRow[]).map((r) => ({
    signals: r.signals,
    outcome: r.outcome,
    closed_pnl: r.closed_pnl,
    currency: r.account_id ? (ccy.get(r.account_id) ?? 'USD') : 'USD',
  }));
  return computeCalibration(rowsToCalReads(rows));
}
