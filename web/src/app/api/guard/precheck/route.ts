import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { getServerEntitlements } from '@/src/lib/billing/server';
import { AI_MODEL, isAiConfigured } from '@/src/lib/ai/client';
import { isOverDailyCap, logUsage, monthlyUsageCount } from '@/src/lib/ai/usage';
import { narrateGuard } from '@/src/lib/ai/guard';
import {
  flagHeadline,
  type GuardContext,
  type GuardSide,
} from '@/src/lib/analytics/tradeGuard';
import { buildBehavioralGuardContext } from '@/src/lib/analytics/guardBehavioral';
import { isTf, tfLabel } from '@/src/lib/analytics/timeframes';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/guard/precheck
//
// Foresight on a PLANNED trade, before you enter. The user supplies the trade
// (symbol/side/entry/stop/target/size); we add the behavioural half (their own
// leaks, committed rules, prop buffer, session, pair record) + news + R:R and
// narrate it with AI. No live market data (no candles/spread), so the technical
// trend read is skipped; everything else is the same brain. Metered like any
// other AI action; nothing is logged (it's hypothetical).

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
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

  const entitlements = await getServerEntitlements(sb);
  if (!entitlements.features.ai) {
    return NextResponse.json(
      { error: 'Foresight requires an active plan.', code: 'upgrade_required' },
      { status: 403 },
    );
  }
  if (await isOverDailyCap(sb, user.id)) {
    return NextResponse.json(
      { error: 'You have reached your daily AI limit. Try again tomorrow.' },
      { status: 429 },
    );
  }
  if ((await monthlyUsageCount(sb, user.id)) >= entitlements.limits.aiActionsPerMonth) {
    return NextResponse.json(
      {
        error: `You have used all ${entitlements.limits.aiActionsPerMonth} AI actions this month.`,
        code: 'quota_reached',
      },
      { status: 429 },
    );
  }
  if (!isAiConfigured()) {
    return NextResponse.json({ error: 'AI is not configured yet.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const accountId = typeof body.accountId === 'string' ? body.accountId : null;
  const symbol = typeof body.symbol === 'string' ? body.symbol.toUpperCase().trim() : null;
  const side: GuardSide = body.side === 'SELL' ? 'SELL' : 'BUY';
  const entry = num(body.entry);
  const volume = num(body.volume);
  const stopLoss = num(body.stopLoss);
  const takeProfit = num(body.takeProfit);
  const riskMoney = num(body.riskMoney);
  const analyzedTf = isTf(body.analyzedTf) ? body.analyzedTf : null;
  const executedTf = isTf(body.executedTf) ? body.executedTf : null;
  const setupId = typeof body.setupId === 'string' && body.setupId ? body.setupId : null;

  if (!accountId || !symbol || entry == null || volume == null) {
    return NextResponse.json(
      { error: 'accountId, symbol, entry and size are required.' },
      { status: 400 },
    );
  }

  // The account must belong to the caller (RLS double-checks).
  const { data: acct } = await sb
    .from('accounts')
    .select('base_currency, starting_balance')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!acct) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }
  const currency =
    (acct as { base_currency?: string | null }).base_currency ?? 'USD';

  try {
    const behavioral = await buildBehavioralGuardContext(sb, {
      userId: user.id,
      accountId,
      symbol,
      volumeLots: volume,
    });

    // Current balance, so the risk signal can show % of account.
    let balance = Number(
      (acct as { starting_balance?: number | null }).starting_balance ?? 0,
    );
    const { data: pnlRows } = await sb
      .from('trades')
      .select('net_pnl, pnl_amount, commission')
      .eq('account_id', accountId);
    for (const r of (pnlRows ?? []) as Array<{
      net_pnl: number | null;
      pnl_amount: number | null;
      commission: number | null;
    }>) {
      balance +=
        r.net_pnl != null
          ? Number(r.net_pnl)
          : Number(r.pnl_amount ?? 0) - Number(r.commission ?? 0);
    }

    // Optional tagged setup, for criteria context.
    let setup: GuardContext['setup'] = null;
    if (setupId) {
      const { data: tpl } = await sb
        .from('setup_templates')
        .select('name')
        .eq('id', setupId)
        .maybeSingle();
      if (tpl) {
        const { data: items } = await sb
          .from('setup_template_items')
          .select('label, is_active')
          .eq('template_id', setupId)
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
      balance,
      currency,
      riskMoney,
      riskRulePct: behavioral.riskRulePct,
      timeframes: [],
      pipSize: null,
      spreadNow: null,
      spreadAvg: null,
      news: behavioral.news,
      minutesSinceLastLoss: behavioral.minutesSinceLastLoss,
      medianVolumeLots: behavioral.medianVolumeLots,
      analyzedTf: analyzedTf ? tfLabel(analyzedTf) : null,
      executedTf: executedTf ? tfLabel(executedTf) : null,
      setup,
      exposure: null,
      committedRuleHits: behavioral.committedRuleHits,
      propBuffer: behavioral.propBuffer,
      pairStats: behavioral.pairStats,
      session: behavioral.session,
    };

    const { signals, summary, usage } = await narrateGuard(ctx);
    await logUsage(sb, user.id, 'guard', AI_MODEL, usage);

    return NextResponse.json({
      tldr: flagHeadline(signals),
      signals,
      summary,
      model: AI_MODEL,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Pre-trade check failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
