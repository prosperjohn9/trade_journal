import Anthropic from '@anthropic-ai/sdk';

// Server-side only. ANTHROPIC_API_KEY must never be exposed to the browser
// (no NEXT_PUBLIC_ prefix). Importing this module from a Client Component would
// be a leak — keep it confined to Route Handlers / server code.

let cached: Anthropic | null = null;

/**
 * Lazily-constructed singleton Anthropic client. Throws a clear error if the
 * key is missing so routes can return a friendly 503 instead of a cryptic
 * SDK failure.
 */
export function getAnthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// One model across every AI feature: Opus 4.8, the most capable model.
export const AI_MODEL = 'claude-opus-4-8';

// Per-feature output caps. max_tokens is the enforced ceiling and bounds the
// most expensive dimension (output tokens cost 5x input on Opus).
export const MAX_TOKENS = {
  tradeReview: 1200,
  insights: 1500,
  chat: 1024,
} as const;

// Soft per-user cap across all AI features over a rolling 24h window. The
// prepaid credit balance is the hard backstop (the API stops at $0); this just
// stops a single user from draining it. Tune freely.
export const AI_USAGE_DAILY_CAP = 50;

// AI Insights: minimum trades before insights are worth generating, and how
// many new trades since the last insight trigger an automatic refresh.
export const MIN_TRADES_FOR_INSIGHTS = 10;
export const INSIGHTS_REFRESH_THRESHOLD = 5;
