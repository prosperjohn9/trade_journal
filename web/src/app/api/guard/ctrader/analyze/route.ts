import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { AI_MODEL, isAiConfigured } from '@/src/lib/ai/client';
import { logUsage } from '@/src/lib/ai/usage';
import { narrateGuard } from '@/src/lib/ai/guard';
import {
  flagHeadline,
  type GuardContext,
  type GuardSide,
  type GuardTimeframe,
} from '@/src/lib/analytics/tradeGuard';
import { buildBehavioralGuardContext } from '@/src/lib/analytics/guardBehavioral';
import { isTf, tfLabel } from '@/src/lib/analytics/timeframes';
import { isOverCtraderReadCap } from '@/src/lib/analytics/foresightCap';
import { sendTelegram } from '@/src/lib/integrations/telegram';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/guard/ctrader/analyze  (worker-only)
//
// Full-parity cTrader Live Guard read. cTrader is Protobuf-over-socket, so the
// always-on worker (which already holds the socket) fetches the live market
// context (candles, spread, dollar risk to the stop) and posts it here with the
// position. This route adds the broker-agnostic behavioural half from the DB +
// news, runs the same analyzer + AI narration as MetaTrader, logs the read, and
// pushes it to the owner's Telegram. No socket here; the brain stays serverless.

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseTimeframes(v: unknown): GuardTimeframe[] {
  if (!Array.isArray(v)) return [];
  const out: GuardTimeframe[] = [];
  for (const t of v) {
    const tf = (t ?? {}) as { tf?: unknown; candles?: unknown };
    if (typeof tf.tf !== 'string' || !Array.isArray(tf.candles)) continue;
    const candles = tf.candles
      .map((c) => {
        const k = (c ?? {}) as Record<string, unknown>;
        const o = num(k.o);
        const h = num(k.h);
        const l = num(k.l);
        const cl = num(k.c);
        return o != null && h != null && l != null && cl != null
          ? { o, h, l, c: cl }
          : null;
      })
      .filter((c): c is { o: number; h: number; l: number; c: number } => c != null);
    if (candles.length >= 6) out.push({ tf: tf.tf, candles });
  }
  return out;
}

export async function POST(request: Request) {
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret || request.headers.get('x-worker-secret') !== workerSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json({ error: 'AI is not configured yet.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    connectionId?: unknown;
    trigger?: unknown;
    position?: unknown;
    market?: unknown;
  };
  const connectionId =
    typeof body.connectionId === 'string' ? body.connectionId : null;
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId is required.' }, { status: 400 });
  }
  const trigger: 'open' | 'modify' =
    body.trigger === 'modify' ? 'modify' : 'open';

  const p = (body.position ?? {}) as Record<string, unknown>;
  const positionId = typeof p.positionId === 'string' ? p.positionId : null;
  const symbol = typeof p.symbol === 'string' ? p.symbol.toUpperCase() : null;
  const side: GuardSide = p.side === 'SELL' ? 'SELL' : 'BUY';
  const entry = num(p.entry);
  const volume = num(p.volume);
  if (!positionId || !symbol || entry == null || volume == null) {
    return NextResponse.json(
      { error: 'position{positionId,symbol,entry,volume} is required.' },
      { status: 400 },
    );
  }
  const stopLoss = num(p.stopLoss);
  const takeProfit = num(p.takeProfit);

  const m = (body.market ?? {}) as Record<string, unknown>;
  const timeframes = parseTimeframes(m.timeframes);
  const exposureRaw = (m.exposure ?? null) as Record<string, unknown> | null;
  const exposure: GuardContext['exposure'] = exposureRaw
    ? {
        others: Number(exposureRaw.others ?? 0),
        sharedCurrencies: Array.isArray(exposureRaw.sharedCurrencies)
          ? (exposureRaw.sharedCurrencies as unknown[]).map((x) => String(x))
          : [],
        totalRiskPct: num(exposureRaw.totalRiskPct),
      }
    : null;

  const sb = createServiceClient();

  // Resolve the cTrader connection -> owner + journal account + read settings.
  const { data: connRow } = await sb
    .from('ctrader_connections')
    .select(
      'id, account_id, user_id, state, guard_analyzed_tf, guard_executed_tf, guard_setup_id',
    )
    .eq('id', connectionId)
    .maybeSingle();
  const conn = connRow as {
    id: string;
    account_id: string;
    user_id: string;
    state: string | null;
    guard_analyzed_tf: string | null;
    guard_executed_tf: string | null;
    guard_setup_id: string | null;
  } | null;
  if (!conn || conn.state === 'breached') {
    return NextResponse.json({ error: 'Unknown cTrader account.' }, { status: 404 });
  }
  const userId = conn.user_id;

  // Free-lane abuse ceiling: skip the AI read when this month's cTrader read
  // allowance is used up. (MetaTrader Foresight is paid and never capped.)
  if (await isOverCtraderReadCap(sb, userId)) {
    return NextResponse.json({ ok: true, skipped: 'cap_reached' });
  }

  const analyzedTf = isTf(conn.guard_analyzed_tf) ? conn.guard_analyzed_tf : null;
  const executedTf = isTf(conn.guard_executed_tf) ? conn.guard_executed_tf : null;

  try {
    const behavioral = await buildBehavioralGuardContext(sb, {
      userId,
      accountId: conn.account_id,
      symbol,
      volumeLots: volume,
    });

    // The tagged setup's checklist, for criteria context (same as MetaTrader).
    let setup: GuardContext['setup'] = null;
    if (conn.guard_setup_id) {
      const { data: tpl } = await sb
        .from('setup_templates')
        .select('name')
        .eq('id', conn.guard_setup_id)
        .maybeSingle();
      if (tpl) {
        const { data: items } = await sb
          .from('setup_template_items')
          .select('label, is_active')
          .eq('template_id', conn.guard_setup_id)
          .order('sort_order', { ascending: true });
        setup = {
          name: (tpl as { name: string }).name,
          criteria: ((items ?? []) as Array<{ label: string; is_active: boolean }>)
            .filter((i) => i.is_active !== false)
            .map((i) => i.label),
        };
      }
    }

    const ctx: GuardContext = {
      symbol,
      side,
      entry,
      stopLoss,
      takeProfit,
      volumeLots: volume,
      balance: num(m.balance),
      currency: typeof m.currency === 'string' ? m.currency : 'USD',
      riskMoney: num(m.riskMoney),
      riskRulePct: behavioral.riskRulePct,
      timeframes,
      pipSize: num(m.pipSize),
      spreadNow: num(m.spreadNow),
      spreadAvg: num(m.spreadAvg),
      news: behavioral.news,
      minutesSinceLastLoss: behavioral.minutesSinceLastLoss,
      medianVolumeLots: behavioral.medianVolumeLots,
      analyzedTf: analyzedTf ? tfLabel(analyzedTf) : null,
      executedTf: executedTf ? tfLabel(executedTf) : null,
      setup,
      exposure,
      committedRuleHits: behavioral.committedRuleHits,
      propBuffer: behavioral.propBuffer,
      pairStats: behavioral.pairStats,
      session: behavioral.session,
    };

    const { signals, summary, usage } = await narrateGuard(ctx);
    await logUsage(sb, userId, 'guard', AI_MODEL, usage);
    const tldr = flagHeadline(signals);

    // Log the read so the trader can review it and the worker can close the loop.
    void sb
      .from('foresight_reads')
      .insert({
        user_id: userId,
        account_id: conn.account_id,
        position_id: positionId,
        symbol,
        side,
        entry,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        volume,
        risk_money: ctx.riskMoney,
        warnings: signals.filter((s) => s.severity === 'warning').length,
        cautions: signals.filter((s) => s.severity === 'caution').length,
        tldr,
        summary,
        signals,
      })
      .then(
        () => {},
        () => {},
      );

    // Push to the owner's Telegram (delivery lives here so the bot token never
    // leaves the app). Best-effort; a missing link just means no push.
    const { data: prof } = await sb
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', userId)
      .maybeSingle();
    const chatId = (prof as { telegram_chat_id?: string | null } | null)
      ?.telegram_chat_id;
    if (chatId) {
      const lead =
        trigger === 'modify'
          ? 'You changed the stop or target on this open trade.\n\n'
          : '';
      const head = `Foresight: ${symbol} ${side} ${volume} lots`;
      const link =
        'See this and past reads: https://tradershindsight.com/foresight';
      await sendTelegram(chatId, `${head}\n\n${lead}${tldr}\n\n${summary}\n\n${link}`);
    }

    return NextResponse.json({ ok: true, tldr, signals, summary, model: AI_MODEL });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Foresight failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
