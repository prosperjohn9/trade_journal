// Server helper: load the trader's resolved Foresight reads and compute their
// per-signal calibration (used by the analyze / ctrader / precheck routes to
// personalise the read). Pure aggregation + row mapping live in
// lib/analytics/calibration.ts; this is just the fetch.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeCalibration,
  rowsToCalReads,
  type RawReadRow,
  type SignalStat,
} from '@/src/lib/analytics/calibration';

/** Fetch this trader's resolved reads and compute their per-signal record. */
export async function loadCalibration(
  sb: SupabaseClient,
  userId: string,
): Promise<Map<string, SignalStat>> {
  const { data } = await sb
    .from('foresight_reads')
    .select('signals, outcome, closed_pnl')
    .eq('user_id', userId)
    .not('outcome', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000);
  return computeCalibration(rowsToCalReads((data ?? []) as RawReadRow[]));
}
