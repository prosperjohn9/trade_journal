// Live Guard narration. Runs the deterministic analyzer, then hands the signals
// that fired to the model to phrase as one calm heads-up. Server-only (imports
// the Anthropic client). The on-demand route and, later, the always-on worker
// both call this; the route meters it like any other AI action.

import { AI_MODEL, getAnthropic } from '@/src/lib/ai/client';
import {
  GUARD_SYSTEM,
  buildGuardInput,
  CLOSE_SYSTEM,
  buildCloseInput,
  CHALLENGE_DEBRIEF_SYSTEM,
  buildDebriefInput,
} from '@/src/lib/ai/prompts';
import {
  analyzeTrade,
  type GuardContext,
  type GuardSignal,
} from '@/src/lib/analytics/tradeGuard';

// Headroom so a rich read (rules + trend + risk + news, with plain-English
// glosses) finishes cleanly instead of truncating mid-sentence.
const GUARD_MAX_TOKENS = 700;

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

export type CloseNarration = { note: string; usage?: GuardUsage };

/** Close-the-loop reflection: the Hindsight lesson tying the entry flags to how
 *  the trade actually closed. One short AI call per closed guarded trade. */
export async function narrateClose(input: {
  symbol: string;
  side: string;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnl: number;
  currency: string;
  flags: string[];
  entryTldr: string | null;
}): Promise<CloseNarration> {
  const message = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 320,
    system: [
      { type: 'text', text: CLOSE_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: buildCloseInput(input) }],
  });

  const note = message.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();

  return { note, usage: message.usage };
}

/** End-of-challenge debrief (pass or breach): the whole-challenge review tying
 *  the trader's edge and leaks to the outcome. One AI call when a challenge ends. */
export async function narrateChallengeDebrief(input: {
  outcome: 'passed' | 'breached';
  accountLabel: string;
  netPnl: number;
  currency: string;
  tradeCount: number;
  winRatePct: number;
  edge: string[];
  leaks: string[];
}): Promise<CloseNarration> {
  const message = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 600,
    system: [
      {
        type: 'text',
        text: CHALLENGE_DEBRIEF_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildDebriefInput(input) }],
  });

  const note = message.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();

  return { note, usage: message.usage };
}
