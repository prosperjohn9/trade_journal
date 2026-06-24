import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  fetchHistoricalDeals,
  DEFAULT_MT_REGION,
} from '@/src/lib/integrations/metaapi';
import { AI_MODEL, isAiConfigured } from '@/src/lib/ai/client';
import { logUsage } from '@/src/lib/ai/usage';
import { narrateClose, narrateChallengeDebrief } from '@/src/lib/ai/guard';
import { sendTelegram } from '@/src/lib/integrations/telegram';
import { syncConnection } from '@/src/lib/integrations/sync';
import {
  computeHindsightReport,
  sessionOf,
  WEEKDAYS,
  type HindsightTrade,
} from '@/src/lib/analytics/hindsight';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/guard/close  (worker-only)
//
// Closes the loop on a guarded trade. When the worker sees a position vanish, it
// calls this with the connection + position id. We look up the read we logged at
// entry, compute the realized P&L from the broker's deal history, record the
// outcome on that read, and push a short result to the owner's Telegram tying
// what Foresight said at entry to how it actually turned out.
//
// If we never logged a read for this position (it was already open before the
// worker started watching), there is nothing to close, so we no-op.

function signed(n: number): string {
  const v = Math.round(n * 100) / 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

/** Best-performing bucket (positive P&L, enough trades) for the edge read. */
function bestBucket(
  trades: HindsightTrade[],
  key: (t: HindsightTrade) => string,
  minTrades: number,
): { name: string; pnl: number; winPct: number } | null {
  const g = new Map<string, { count: number; pnl: number; wins: number }>();
  for (const t of trades) {
    const k = key(t);
    const e = g.get(k) ?? { count: 0, pnl: 0, wins: 0 };
    e.count += 1;
    e.pnl += t.pnl;
    if (t.outcome === 'WIN') e.wins += 1;
    g.set(k, e);
  }
  let best: { name: string; pnl: number; winPct: number } | null = null;
  for (const [name, e] of g) {
    if (e.count < minTrades || e.pnl <= 0) continue;
    const cand = {
      name,
      pnl: e.pnl,
      winPct: Math.round((e.wins / e.count) * 100),
    };
    if (!best || cand.pnl > best.pnl) best = cand;
  }
  return best;
}

/** End-of-challenge AI debrief (pass or breach): the trader's edge + costliest
 *  leaks across the whole challenge, narrated and pushed to Telegram. */
async function sendChallengeDebrief(
  sb: ReturnType<typeof createServiceClient>,
  accountId: string,
  userId: string,
  outcome: 'passed' | 'breached',
  currency: string,
  chatId: string,
): Promise<void> {
  const [{ data: acct }, { data: prof }, { data: tradeRows }] =
    await Promise.all([
      sb.from('accounts').select('name').eq('id', accountId).maybeSingle(),
      sb.from('profiles').select('timezone').eq('id', userId).maybeSingle(),
      sb
        .from('trades')
        .select(
          'opened_at, closed_at, outcome, instrument, volume, net_pnl, pnl_amount, commission, emotion_tag',
        )
        .eq('account_id', accountId),
    ]);

  const rows = (tradeRows ?? []) as Array<{
    opened_at: string;
    closed_at: string | null;
    outcome: string | null;
    instrument: string | null;
    volume: number | null;
    net_pnl: number | null;
    pnl_amount: number | null;
    commission: number | null;
    emotion_tag: string | null;
  }>;
  if (rows.length < 5) return; // too thin for a meaningful debrief

  const tz = (prof as { timezone?: string | null } | null)?.timezone ?? 'UTC';
  const label = (acct as { name?: string | null } | null)?.name ?? 'your account';
  const trades: HindsightTrade[] = rows.map((r) => ({
    opened_at: r.opened_at,
    closed_at: r.closed_at,
    outcome: r.outcome,
    pnl:
      r.net_pnl != null
        ? Number(r.net_pnl)
        : Number(r.pnl_amount ?? 0) - Number(r.commission ?? 0),
    volume: r.volume,
    instrument: r.instrument,
    emotion_tag: r.emotion_tag,
  }));

  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter((t) => t.outcome === 'WIN').length;
  const winRatePct = Math.round((wins / trades.length) * 100);

  const report = computeHindsightReport(trades, tz);
  const leaks = report.findings
    .slice(0, 2)
    .map(
      (f) =>
        `${f.label} cost ${Math.round(f.cost)} ${currency} across ${f.tradeCount} trades`,
    );

  const edge: string[] = [];
  const bestSession = bestBucket(trades, (t) => sessionOf(t.opened_at), 5);
  if (bestSession)
    edge.push(
      `${bestSession.name} session (${bestSession.winPct}% win, +${Math.round(bestSession.pnl)} ${currency})`,
    );
  const bestDay = bestBucket(
    trades,
    (t) => WEEKDAYS[new Date(t.opened_at).getUTCDay()],
    5,
  );
  if (bestDay) edge.push(`${bestDay.name}s (+${Math.round(bestDay.pnl)} ${currency})`);

  if (!isAiConfigured()) {
    await sendTelegram(
      chatId,
      `Challenge ${outcome} on ${label}: ${signed(netPnl)} ${currency} across ${trades.length} trades.`,
    ).catch(() => {});
    return;
  }
  try {
    const { note, usage } = await narrateChallengeDebrief({
      outcome,
      accountLabel: label,
      netPnl,
      currency,
      tradeCount: trades.length,
      winRatePct,
      edge,
      leaks,
    });
    await logUsage(sb, userId, 'guard_close', AI_MODEL, usage);
    if (note) await sendTelegram(chatId, note).catch(() => {});
  } catch {
    // best-effort; the per-trade close already went out
  }
}

export async function POST(request: Request) {
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret || request.headers.get('x-worker-secret') !== workerSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    connectionId?: unknown;
    accountId?: unknown;
    positionId?: unknown;
  };
  const connectionId =
    typeof body.connectionId === 'string' ? body.connectionId : null;
  const accountIdIn =
    typeof body.accountId === 'string' ? body.accountId : null;
  const positionId =
    typeof body.positionId === 'string' ? body.positionId : null;
  if (!positionId || (!connectionId && !accountIdIn)) {
    return NextResponse.json(
      { error: 'positionId and connectionId (or accountId) are required.' },
      { status: 400 },
    );
  }

  const sb = createServiceClient();

  // Resolve the connection -> owner + MetaApi account.
  let q = sb
    .from('mt_connections')
    .select('id, account_id, metaapi_account_id, region, user_id, guard_enabled');
  if (connectionId) q = q.eq('id', connectionId);
  else if (accountIdIn) q = q.eq('account_id', accountIdIn);
  const { data: conn } = await q.maybeSingle();
  const c = conn as {
    id: string;
    account_id: string;
    metaapi_account_id: string | null;
    region: string | null;
    user_id: string;
    guard_enabled: boolean | null;
  } | null;
  if (!c?.metaapi_account_id) {
    return NextResponse.json({ ok: true, skipped: 'no-connection' });
  }

  // The read we logged at entry (still open = outcome null). No read means we
  // never analyzed this trade; nothing to close.
  const { data: readRow } = await sb
    .from('foresight_reads')
    .select('id, symbol, side, tldr, warnings, signals')
    .eq('account_id', c.account_id)
    .eq('position_id', positionId)
    .is('outcome', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const read = readRow as {
    id: string;
    symbol: string;
    side: string;
    tldr: string | null;
    warnings: number | null;
    signals: Array<{ severity: string; title: string }> | null;
  } | null;
  if (!read) {
    return NextResponse.json({ ok: true, skipped: 'no-read' });
  }

  // Realized P&L = sum of profit + commission + swap across this position's
  // deals over a recent window (the closing deal lands within minutes).
  let pnl = 0;
  let closeFound = false;
  try {
    const region = c.region ?? DEFAULT_MT_REGION;
    const OUT_ENTRIES = new Set([
      'DEAL_ENTRY_OUT',
      'DEAL_ENTRY_OUT_BY',
      'DEAL_ENTRY_INOUT',
    ]);
    // The worker reports the close the instant the position vanishes, but the
    // closing deal can take a few seconds to land in MetaApi's history. Poll
    // until the closing (OUT) deal for this position appears, so we never report
    // a hit-TP trade as "+0.00 flat". ~18s max, well within the function budget.
    for (let attempt = 0; attempt < 6; attempt++) {
      const deals = await fetchHistoricalDeals({
        metaApiAccountId: c.metaapi_account_id,
        region,
        from: new Date(Date.now() - 60 * 60_000),
        to: new Date(Date.now() + 60_000),
      });
      const mine = deals.filter((d) => d.positionId === positionId);
      if (mine.some((d) => OUT_ENTRIES.has(d.entryType ?? ''))) {
        pnl = mine.reduce(
          (s, d) =>
            s +
            Number(d.profit ?? 0) +
            Number(d.commission ?? 0) +
            Number(d.swap ?? 0),
          0,
        );
        closeFound = true;
        break;
      }
      if (attempt < 5) await new Promise((r) => setTimeout(r, 3000));
    }
  } catch {
    // Deal feed briefly unavailable; fall through with closeFound = false.
  }

  // Don't claim a breakeven we didn't actually measure: if the closing deal
  // never landed, say the result is still syncing rather than "+0.00 flat".
  if (!closeFound) {
    const owner = c.user_id;
    const { data: prof } = await sb
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', owner)
      .maybeSingle();
    const chat = (prof as { telegram_chat_id?: string | null } | null)
      ?.telegram_chat_id;
    if (chat) {
      await sendTelegram(
        chat,
        `${read.symbol} ${read.side} closed. Final P&L is still settling at the broker; it will appear in your journal shortly.`,
      ).catch(() => {});
    }
    return NextResponse.json({ ok: true, pending: true });
  }

  const outcome =
    Math.abs(pnl) < 0.01 ? 'BREAKEVEN' : pnl > 0 ? 'WIN' : 'LOSS';
  const won = outcome === 'WIN';

  const flags = (read.signals ?? [])
    .filter((s) => s.severity === 'warning' || s.severity === 'caution')
    .map((s) => s.title);
  const hadWarning = (read.signals ?? []).some((s) => s.severity === 'warning');
  const flagList = [...new Set(flags)].slice(0, 4).join('; ');

  const { data: acct } = await sb
    .from('accounts')
    .select('base_currency')
    .eq('id', c.account_id)
    .maybeSingle();
  const currency =
    (acct as { base_currency?: string | null } | null)?.base_currency ?? 'USD';

  // Templated fallback, used only if the AI reflection is unavailable.
  let note: string;
  if (outcome === 'BREAKEVEN') {
    note =
      flags.length === 0
        ? 'Closed flat. Nothing was flagged, so a neutral result with nothing to fix.'
        : `Closed flat, so it did not punish you this time, but you flagged ${flagList} at entry. Flat is luck here, not a green light to keep taking that setup.`;
  } else if (flags.length === 0) {
    note = won
      ? 'Nothing was flagged at entry and it came in. Process and result lined up, this is what a clean trade looks like.'
      : 'Nothing was flagged at entry, so this is a normal losing trade, not a behavioural leak. Part of the game; do not overcorrect.';
  } else if (won) {
    note = `It worked out, but Foresight flagged ${flags.length} thing${flags.length === 1 ? '' : 's'} at entry: ${flagList}. Those were real risks, not the reason you won. Winning on a flagged trade is exactly how a leak gets reinforced, so judge this by the process, not the green number.`;
  } else {
    note = `The risks flagged at entry showed up: ${flagList}. ${hadWarning ? 'The warning there is a leak to fix, not bad luck.' : 'Worth reviewing whether those cautions made the difference.'}`;
  }

  // The real Hindsight lesson: an AI reflection tying the entry flags to how it
  // closed. Falls back to the template above if AI is off or errors.
  if (isAiConfigured()) {
    try {
      const { note: aiNote, usage } = await narrateClose({
        symbol: read.symbol,
        side: read.side,
        outcome,
        pnl,
        currency,
        flags,
        entryTldr: read.tldr,
      });
      if (aiNote) {
        note = aiNote;
        await logUsage(sb, c.user_id, 'guard_close', AI_MODEL, usage);
      }
    } catch {
      // keep the templated note
    }
  }

  await sb
    .from('foresight_reads')
    .update({
      outcome,
      closed_pnl: Math.round(pnl * 100) / 100,
      outcome_note: note,
    })
    .eq('id', read.id);

  // Push the result, tied back to what Foresight said at entry.
  const { data: prof } = await sb
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', c.user_id)
    .maybeSingle();
  const chatId = (prof as { telegram_chat_id?: string | null } | null)
    ?.telegram_chat_id;
  if (chatId) {
    const verb =
      outcome === 'WIN'
        ? 'closed in profit'
        : outcome === 'LOSS'
          ? 'closed at a loss'
          : 'closed flat';
    const head = `${read.symbol} ${read.side} ${verb}: ${signed(pnl)} ${currency}`;
    await sendTelegram(chatId, `${head}\n\n${note}`);
  }

  // Journal the closed trade now (real-time freshness for guarded accounts) and
  // run the prop terminal-state check. Done AFTER the close-the-loop on purpose:
  // a passed/breached account has its MetaApi account removed here, which would
  // otherwise break the deal fetch above. syncConnection never undeploys a
  // guard_enabled account, so this stays free.
  let terminal: 'passed' | 'breached' | null = null;
  try {
    const res = await syncConnection(
      sb,
      {
        id: c.id,
        account_id: c.account_id,
        metaapi_account_id: c.metaapi_account_id,
        region: c.region,
        guard_enabled: c.guard_enabled,
      },
      c.user_id,
    );
    terminal = res?.passed ? 'passed' : res?.breached ? 'breached' : null;
  } catch {
    // ignore; the daily cron backstops the journal + the terminal check
  }

  // The challenge ended on this trade (passed or breached): send a full AI
  // debrief of the whole challenge (edge + costliest leaks + a forward-looking
  // line), not just a close line. Honest either way, no cheerleading on a pass,
  // no doom on a breach.
  if (terminal && chatId) {
    await sendChallengeDebrief(
      sb,
      c.account_id,
      c.user_id,
      terminal,
      currency,
      chatId,
    );
  }

  return NextResponse.json({ ok: true, outcome, pnl, passed: terminal === 'passed' });
}
