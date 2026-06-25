import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { getServerEntitlements } from '@/src/lib/billing/server';
import { AI_MODEL, isAiConfigured } from '@/src/lib/ai/client';
import { isOverDailyCap, logUsage, monthlyUsageCount } from '@/src/lib/ai/usage';
import { narrateGuard } from '@/src/lib/ai/guard';
import { loadCalibration } from '@/src/lib/ai/guardCalibration';
import { gradeRead } from '@/src/lib/analytics/calibration';
import {
  flagHeadline,
  type GuardContext,
  type GuardSide,
} from '@/src/lib/analytics/tradeGuard';
import { buildBehavioralGuardContext } from '@/src/lib/analytics/guardBehavioral';
import { isTf, tfLabel, analysisTimeframes } from '@/src/lib/analytics/timeframes';
import {
  getAccountStatus,
  deployAccount,
  undeployAccount,
  waitUntilConnected,
  fetchCandles,
  fetchTickSize,
  DEFAULT_MT_REGION,
} from '@/src/lib/integrations/metaapi';
import type { GuardTimeframe } from '@/src/lib/analytics/tradeGuard';
import { fetchCtraderTimeframes } from '@/src/lib/integrations/ctraderMarket';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/guard/precheck
//
// Foresight on a PLANNED trade, before you enter. The user supplies the trade
// (symbol/side/entry/stop/target/size); we add the behavioural half (their own
// leaks, committed rules, prop buffer, session, pair record) + news + R:R, plus
// the TECHNICAL read (trend, ATR-stop, structure/SL-TP) by fetching candles for
// the symbol from the account's connected broker. The broker fetch is READ-ONLY
// by default (never deploys); with { wake: true } a cold account is briefly
// deployed then undeployed to serve candles, the same opt-in as the live panel.
// Metered like any AI action; nothing is logged (it's hypothetical).

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
  const wantWake = body.wake === true;

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

    // ---- Optional live technical read -------------------------------------
    // Candles + tick size for the planned symbol, from the account's connected
    // MetaTrader broker, so the read includes trend, ATR-stop and the SL/TP
    // structure signals. READ-ONLY by default; wake briefly connects a cold
    // account then undeploys it.
    let timeframes: GuardTimeframe[] = [];
    let pipSize: number | null = null;
    let technicalNote: string | null = null;
    let undeployAfter = false;
    let warming = false;
    let warmAccountId: string | null = null;

    const { data: rawConns } = await sb
      .from('mt_connections')
      .select('metaapi_account_id, region, state')
      .eq('user_id', user.id)
      .eq('account_id', accountId);
    const deadStates = new Set(['breached', 'over_limit', 'passed']);
    const conn = ((rawConns ?? []) as Array<{
      metaapi_account_id: string;
      region: string | null;
      state: string | null;
    }>).find((c) => !deadStates.has(c.state ?? ''));

    if (!conn) {
      // No MetaTrader on this account -> try cTrader. Its Open API is a free
      // short-lived socket, so there is no deploy/wake cost; the technical read
      // is always available when the symbol and data are there.
      const ct = await fetchCtraderTimeframes(
        sb,
        user.id,
        accountId,
        symbol,
        analyzedTf,
      );
      if (ct.timeframes.length) {
        timeframes = ct.timeframes;
        pipSize = ct.pipSize;
      } else {
        technicalNote =
          'No live broker data for this account, so the technical read (trend, structure, ATR) is skipped. Connect MetaTrader or cTrader, or check the exact symbol name.';
      }
    } else {
      const region = conn.region ?? DEFAULT_MT_REGION;
      warmAccountId = conn.metaapi_account_id;
      try {
        const status = await getAccountStatus(conn.metaapi_account_id);
        let live =
          status.state === 'DEPLOYED' && status.connectionStatus === 'CONNECTED';
        if (!live && wantWake) {
          if (status.state !== 'DEPLOYED' && status.state !== 'DEPLOYING') {
            await deployAccount(conn.metaapi_account_id);
          }
          const ok = await waitUntilConnected(conn.metaapi_account_id, {
            timeoutMs: 35_000,
          });
          if (ok) {
            live = true;
            undeployAfter = true;
          } else {
            warming = true;
          }
        }
        if (live) {
          const tfs = analysisTimeframes(analyzedTf);
          const [tickSize, candleResults] = await Promise.all([
            fetchTickSize(conn.metaapi_account_id, region, symbol),
            Promise.all(
              tfs.map((t) =>
                fetchCandles(conn.metaapi_account_id, region, symbol, t.code, 120),
              ),
            ),
          ]);
          timeframes = tfs
            .map((t, i) => ({ tf: t.tf, candles: candleResults[i].candles }))
            .filter((t) => t.candles.length >= 6);
          pipSize = tickSize && tickSize > 0 ? tickSize * 10 : null;
          if (!timeframes.length) {
            technicalNote = `No candles came back for ${symbol} on this broker, so the technical read is skipped. Check the exact broker symbol.`;
          }
        } else if (!warming) {
          technicalNote =
            'This account is idle, so the live technical read (trend, structure, ATR) is skipped. Tick "Wake for the technical read" to briefly connect and include it.';
        }
      } catch {
        technicalNote =
          'Could not reach the broker for the technical read; showing the behavioural read only.';
      } finally {
        if (undeployAfter && warmAccountId) {
          try {
            await undeployAccount(warmAccountId);
          } catch {
            // best-effort; the daily reconcile will undeploy it
          }
        }
      }
    }

    if (warming) {
      return NextResponse.json(
        {
          error:
            'Waking your account. The first connect can take a minute; it stays warming up, so tap Check this trade again shortly.',
          code: 'warming_up',
        },
        { status: 409 },
      );
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
      timeframes,
      pipSize,
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

    ctx.calibration = await loadCalibration(sb, user.id);

    const { signals, summary, usage } = await narrateGuard(ctx);
    await logUsage(sb, user.id, 'guard', AI_MODEL, usage);

    const { grade } = gradeRead(signals, ctx.calibration);

    return NextResponse.json({
      tldr: `Grade ${grade}. ${flagHeadline(signals)}`,
      grade,
      signals,
      summary,
      model: AI_MODEL,
      technicalIncluded: timeframes.length > 0,
      technicalNote,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Pre-trade check failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
