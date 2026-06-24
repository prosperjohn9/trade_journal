import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  fetchHistoricalDeals,
  DEFAULT_MT_REGION,
} from '@/src/lib/integrations/metaapi';
import { AI_MODEL, isAiConfigured } from '@/src/lib/ai/client';
import { logUsage } from '@/src/lib/ai/usage';
import { narrateClose } from '@/src/lib/ai/guard';
import { sendTelegram } from '@/src/lib/integrations/telegram';
import { syncConnection } from '@/src/lib/integrations/sync';

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
  let passed = false;
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
    passed = res?.passed === true;
  } catch {
    // ignore; the daily cron backstops the journal + the terminal check
  }

  // Passed the challenge on this trade: send a proper congratulations, not just a
  // close line, and be honest about whether this trade earned it or got lucky.
  if (passed && chatId) {
    const congrats =
      `Challenge passed. ${read.symbol} ${read.side} closed it out at ${signed(pnl)} ${currency}, and the account hit its profit target.\n\n` +
      (flags.length === 0
        ? 'Clean execution on the trade that did it, carry that same discipline onto the funded account.'
        : `It got the result, but this trade carried real flags (${flagList}). Passing on a flagged trade is how a risky habit sneaks onto a funded account, so judge it by the process, not the pass.`) +
      `\n\nYour prop firm issues a fresh funded login when you pass. Connect it here to keep Foresight running, and see your full breakdown: https://tradershindsight.com/foresight`;
    await sendTelegram(chatId, congrats).catch(() => {});
  }

  return NextResponse.json({ ok: true, outcome, pnl, passed });
}
