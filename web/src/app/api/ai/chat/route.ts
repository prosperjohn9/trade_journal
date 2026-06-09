import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { getServerEntitlements } from '@/src/lib/billing/server';
import {
  AI_MODEL,
  MAX_TOKENS,
  getAnthropic,
  isAiConfigured,
} from '@/src/lib/ai/client';
import { CHAT_SYSTEM, buildChatStatsContext } from '@/src/lib/ai/prompts';
import { isOverDailyCap, logUsage, monthlyUsageCount } from '@/src/lib/ai/usage';
import { computeReport, type TradeRow } from '@/src/lib/analytics/core';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Bound the input tokens regardless of how long the client-held history grows.
const MAX_MESSAGES = 16;
const MAX_CONTENT_CHARS = 4000;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const entitlements = await getServerEntitlements(sb);
  if (!entitlements.features.ai) {
    return json(
      { error: 'AI chat requires an active plan.', code: 'upgrade_required' },
      403,
    );
  }

  if (!isAiConfigured()) {
    return json({ error: 'AI is not configured yet.' }, 503);
  }
  if (await isOverDailyCap(sb, user.id)) {
    return json(
      { error: 'You have reached your daily AI limit. Try again tomorrow.' },
      429,
    );
  }
  if (
    (await monthlyUsageCount(sb, user.id)) >=
    entitlements.limits.aiActionsPerMonth
  ) {
    return json(
      {
        error: `You have used all ${entitlements.limits.aiActionsPerMonth} AI actions in your plan this month. They reset on the 1st, or upgrade for more.`,
        code: 'quota_reached',
      },
      429,
    );
  }

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const raw: unknown[] = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (
      (role === 'user' || role === 'assistant') &&
      typeof content === 'string' &&
      content.trim()
    ) {
      messages.push({ role, content: content.slice(0, MAX_CONTENT_CHARS) });
    }
  }
  const history = messages.slice(-MAX_MESSAGES);
  if (!history.length || history[history.length - 1].role !== 'user') {
    return json({ error: 'A user message is required' }, 400);
  }

  // Data-awareness: compute the user's aggregate stats and pass a compact
  // summary as context (the prompt tells the model to use it only when asked).
  const [{ data: tradesRaw }, { data: accounts }, { data: profile }] =
    await Promise.all([
      sb
        .from('trades')
        .select(
          'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, risk_amount, r_multiple',
        ),
      sb.from('accounts').select('starting_balance'),
      sb
        .from('profiles')
        .select('timezone, starting_balance, base_currency')
        .eq('id', user.id)
        .maybeSingle(),
    ]);
  const trades = (tradesRaw ?? []) as unknown as TradeRow[];
  const accountRows = (accounts ?? []) as { starting_balance: number | null }[];
  const profileRow = (profile ?? null) as {
    timezone?: string | null;
    starting_balance?: number | null;
    base_currency?: string | null;
  } | null;
  const startingBalance =
    accountRows.reduce((s, a) => s + Number(a.starting_balance ?? 0), 0) ||
    Number(profileRow?.starting_balance ?? 0);
  const statsContext = buildChatStatsContext(
    trades.length
      ? computeReport({
          trades,
          startingBalance,
          timeZone: profileRow?.timezone ?? 'UTC',
        })
      : null,
    profileRow?.base_currency ?? 'USD',
  );

  const stream = getAnthropic().messages.stream({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS.chat,
    system: [
      { type: 'text', text: CHAT_SYSTEM, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: statsContext },
    ],
    messages: history,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (e) {
        controller.error(e);
        return;
      }
      controller.close();

      // Best-effort usage logging once the stream is complete.
      try {
        const final = await stream.finalMessage();
        await logUsage(sb, user.id, 'chat', AI_MODEL, final.usage);
      } catch {
        // ignore
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
