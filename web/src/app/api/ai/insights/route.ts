import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import {
  AI_MODEL,
  INSIGHTS_REFRESH_THRESHOLD,
  MAX_TOKENS,
  MIN_TRADES_FOR_INSIGHTS,
  getAnthropic,
  isAiConfigured,
} from '@/src/lib/ai/client';
import { INSIGHTS_SYSTEM, buildInsightsInput } from '@/src/lib/ai/prompts';
import { isOverDailyCap, logUsage } from '@/src/lib/ai/usage';
import { computeReport, type TradeRow } from '@/src/lib/analytics/core';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Sb = ReturnType<typeof createSupabaseWithToken>;

const TRADE_SELECT =
  'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, risk_amount, r_multiple';

async function authed(request: Request) {
  const token = getToken(request);
  if (!token) {
    return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) {
    return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { sb, user };
}

async function countTrades(sb: Sb): Promise<number> {
  const { count } = await sb
    .from('trades')
    .select('id', { count: 'exact', head: true });
  return count ?? 0;
}

export async function GET(request: Request) {
  const a = await authed(request);
  if ('res' in a) return a.res;
  const { sb } = a;

  const [{ data: cached }, tradeCount] = await Promise.all([
    sb
      .from('ai_insights')
      .select('content, model, trade_count, updated_at')
      .maybeSingle(),
    countTrades(sb),
  ]);

  const canGenerate = tradeCount >= MIN_TRADES_FOR_INSIGHTS;
  const stale = cached
    ? tradeCount - (cached.trade_count ?? 0) >= INSIGHTS_REFRESH_THRESHOLD
    : canGenerate;

  return NextResponse.json({
    insights: cached?.content ?? null,
    model: cached?.model ?? null,
    generatedAt: cached?.updated_at ?? null,
    tradeCount,
    canGenerate,
    stale,
    minTrades: MIN_TRADES_FOR_INSIGHTS,
  });
}

export async function POST(request: Request) {
  const a = await authed(request);
  if ('res' in a) return a.res;
  const { sb, user } = a;

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: 'AI is not configured yet. Add ANTHROPIC_API_KEY to enable insights.' },
      { status: 503 },
    );
  }
  if (await isOverDailyCap(sb, user.id)) {
    return NextResponse.json(
      { error: 'You have reached your daily AI limit. Try again tomorrow.' },
      { status: 429 },
    );
  }

  const [{ data: tradesRaw }, { data: accounts }, { data: profile }] =
    await Promise.all([
      sb.from('trades').select(TRADE_SELECT),
      sb.from('accounts').select('starting_balance'),
      sb
        .from('profiles')
        .select('timezone, starting_balance')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

  const trades = (tradesRaw ?? []) as unknown as TradeRow[];
  if (trades.length < MIN_TRADES_FOR_INSIGHTS) {
    return NextResponse.json(
      { error: `Add at least ${MIN_TRADES_FOR_INSIGHTS} trades to generate insights.` },
      { status: 400 },
    );
  }

  const accountRows = (accounts ?? []) as { starting_balance: number | null }[];
  const profileRow = (profile ?? null) as {
    timezone?: string | null;
    starting_balance?: number | null;
  } | null;
  const startingBalance =
    accountRows.reduce((sum, acc) => sum + Number(acc.starting_balance ?? 0), 0) ||
    Number(profileRow?.starting_balance ?? 0);
  const timeZone = profileRow?.timezone ?? 'UTC';

  const report = computeReport({ trades, startingBalance, timeZone });

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
      max_tokens: MAX_TOKENS.insights,
      system: [
        { type: 'text', text: INSIGHTS_SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: buildInsightsInput(report) }],
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
    return NextResponse.json({ error: 'AI returned empty insights' }, { status: 502 });
  }

  const generatedAt = new Date().toISOString();
  await sb.from('ai_insights').upsert(
    {
      user_id: user.id,
      content,
      model: AI_MODEL,
      trade_count: trades.length,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      updated_at: generatedAt,
    },
    { onConflict: 'user_id' },
  );
  await logUsage(sb, user.id, 'insights', AI_MODEL, usage);

  return NextResponse.json({
    insights: content,
    model: AI_MODEL,
    generatedAt,
    tradeCount: trades.length,
  });
}
