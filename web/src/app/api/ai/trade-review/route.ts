import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import {
  AI_MODEL,
  MAX_TOKENS,
  getAnthropic,
  isAiConfigured,
} from '@/src/lib/ai/client';
import { TRADE_REVIEW_SYSTEM, buildTradeReviewInput } from '@/src/lib/ai/prompts';
import { isOverDailyCap, logUsage } from '@/src/lib/ai/usage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TRADE_SELECT = `
  id, opened_at, closed_at, instrument, direction, outcome,
  pnl_amount, pnl_percent, risk_amount, r_multiple, net_pnl, commission,
  entry_price, stop_loss, take_profit, exit_price,
  notes, emotion_tag, lesson_learned, review_notes, template_id,
  account:accounts(name, account_type, base_currency)
`;

// Cheap, read-only check for an already-generated review. Never calls Claude,
// so the UI can look one up on page load without spending credits.
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tradeId = new URL(request.url).searchParams.get('tradeId');
  if (!tradeId) {
    return NextResponse.json({ error: 'tradeId is required' }, { status: 400 });
  }

  const { data } = await sb
    .from('trade_ai_reviews')
    .select('content, model, updated_at, stale')
    .eq('trade_id', tradeId)
    .maybeSingle();

  return NextResponse.json(
    data
      ? {
          review: data.content,
          model: data.model,
          updated_at: data.updated_at,
          stale: data.stale,
        }
      : { review: null },
  );
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { tradeId?: unknown; regenerate?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const tradeId = typeof body.tradeId === 'string' ? body.tradeId : null;
  const regenerate = body.regenerate === true;
  if (!tradeId) {
    return NextResponse.json({ error: 'tradeId is required' }, { status: 400 });
  }

  // Serve the cached review unless a regenerate was explicitly requested.
  if (!regenerate) {
    const { data: existing } = await sb
      .from('trade_ai_reviews')
      .select('content, model, updated_at, stale')
      .eq('trade_id', tradeId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        review: existing.content,
        model: existing.model,
        cached: true,
        stale: existing.stale,
        updated_at: existing.updated_at,
      });
    }
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: 'AI is not configured yet. Add ANTHROPIC_API_KEY to enable reviews.' },
      { status: 503 },
    );
  }

  if (await isOverDailyCap(sb, user.id)) {
    return NextResponse.json(
      { error: 'You have reached your daily AI limit. Try again tomorrow.' },
      { status: 429 },
    );
  }

  // Fetch the trade. RLS guarantees the caller owns it.
  const { data: tradeRaw, error: tradeErr } = await sb
    .from('trades')
    .select(TRADE_SELECT)
    .eq('id', tradeId)
    .single();
  if (tradeErr) {
    const notFound = tradeErr.code === 'PGRST116';
    return NextResponse.json(
      { error: notFound ? 'Trade not found' : tradeErr.message },
      { status: notFound ? 404 : 500 },
    );
  }
  const trade = tradeRaw as Record<string, unknown>;

  // Checklist adherence: the template's items plus which were ticked for this trade.
  const checklist: { label: string; checked: boolean }[] = [];
  if (typeof trade.template_id === 'string') {
    const { data: items } = await sb
      .from('setup_template_items')
      .select('id, label')
      .eq('template_id', trade.template_id)
      .order('sort_order', { ascending: true });
    if (items && items.length) {
      const ids = items.map((i) => (i as { id: string }).id);
      const { data: checks } = await sb
        .from('trade_criteria_checks')
        .select('item_id, checked')
        .eq('trade_id', tradeId)
        .in('item_id', ids);
      const checkedById = new Map(
        (checks ?? []).map((c) => [
          (c as { item_id: string }).item_id,
          Boolean((c as { checked: boolean }).checked),
        ]),
      );
      for (const i of items) {
        const item = i as { id: string; label: string };
        checklist.push({ label: item.label, checked: checkedById.get(item.id) ?? false });
      }
    }
  }

  // Call Claude.
  let content = '';
  let usage:
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
      }
    | undefined;
  try {
    const message = await getAnthropic().messages.create({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS.tradeReview,
      system: [
        { type: 'text', text: TRADE_REVIEW_SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: buildTradeReviewInput(trade, checklist) }],
    });
    content = message.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    usage = message.usage;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'AI request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!content) {
    return NextResponse.json({ error: 'AI returned an empty review' }, { status: 502 });
  }

  // Persist the review (upsert) and log usage. Both best-effort.
  await sb.from('trade_ai_reviews').upsert(
    {
      trade_id: tradeId,
      user_id: user.id,
      content,
      model: AI_MODEL,
      stale: false,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'trade_id' },
  );
  await logUsage(sb, user.id, 'trade_review', AI_MODEL, usage);

  return NextResponse.json({ review: content, model: AI_MODEL, cached: false });
}
