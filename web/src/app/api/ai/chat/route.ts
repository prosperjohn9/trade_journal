import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import {
  AI_MODEL,
  MAX_TOKENS,
  getAnthropic,
  isAiConfigured,
} from '@/src/lib/ai/client';
import { CHAT_SYSTEM } from '@/src/lib/ai/prompts';
import { isOverDailyCap, logUsage } from '@/src/lib/ai/usage';

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

  if (!isAiConfigured()) {
    return json({ error: 'AI is not configured yet.' }, 503);
  }
  if (await isOverDailyCap(sb, user.id)) {
    return json(
      { error: 'You have reached your daily AI limit. Try again tomorrow.' },
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

  const stream = getAnthropic().messages.stream({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS.chat,
    system: [
      { type: 'text', text: CHAT_SYSTEM, cache_control: { type: 'ephemeral' } },
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
