import type { createSupabaseWithToken } from '@/src/lib/supabase/server';
import { AI_USAGE_DAILY_CAP } from './client';

type Sb = ReturnType<typeof createSupabaseWithToken>;
type Feature = 'trade_review' | 'insights' | 'chat';

type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
} | null
  | undefined;

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * True when the user has already made AI_USAGE_DAILY_CAP calls in the last 24h.
 * Counts rows under RLS, so it only ever sees the caller's own usage.
 */
export async function isOverDailyCap(sb: Sb, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - ROLLING_WINDOW_MS).toISOString();
  const { count, error } = await sb
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);

  // Fail open on a count error rather than blocking the feature — the prepaid
  // balance is still the hard cap.
  if (error) return false;
  return (count ?? 0) >= AI_USAGE_DAILY_CAP;
}

/** Record one AI call. Best-effort: callers should not fail the response if this throws. */
export async function logUsage(
  sb: Sb,
  userId: string,
  feature: Feature,
  model: string,
  usage: UsageLike,
): Promise<void> {
  await sb.from('ai_usage').insert({
    user_id: userId,
    feature,
    model,
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
  });
}
