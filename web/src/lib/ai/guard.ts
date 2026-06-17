// Live Guard narration. Runs the deterministic analyzer, then hands the signals
// that fired to the model to phrase as one calm heads-up. Server-only (imports
// the Anthropic client). The on-demand route and, later, the always-on worker
// both call this; the route meters it like any other AI action.

import { AI_MODEL, getAnthropic } from '@/src/lib/ai/client';
import { GUARD_SYSTEM, buildGuardInput } from '@/src/lib/ai/prompts';
import {
  analyzeTrade,
  type GuardContext,
  type GuardSignal,
} from '@/src/lib/analytics/tradeGuard';

const GUARD_MAX_TOKENS = 400;

export type GuardUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export type GuardNarration = {
  signals: GuardSignal[];
  summary: string;
  usage?: GuardUsage;
};

/** Analyze the trade and narrate it. The signals are always returned (they are
 *  free, deterministic); the summary is the one AI-spend per call. */
export async function narrateGuard(
  ctx: GuardContext,
): Promise<GuardNarration> {
  const signals = analyzeTrade(ctx);

  const message = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: GUARD_MAX_TOKENS,
    system: [
      { type: 'text', text: GUARD_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: buildGuardInput(ctx, signals) }],
  });

  const summary = message.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();

  return { signals, summary, usage: message.usage };
}
