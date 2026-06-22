import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { AI_MODEL, isAiConfigured } from '@/src/lib/ai/client';
import { logUsage } from '@/src/lib/ai/usage';
import { narrateClose } from '@/src/lib/ai/guard';
import { sendTelegram } from '@/src/lib/integrations/telegram';

export const runtime = 'nodejs';
export const maxDuration = 30;

// POST /api/guard/ctrader/close  (worker-only)
//
// Close-the-loop for a guarded cTrader trade. The worker sees the position
// vanish, reads the realized P&L from the cTrader closing deal, and posts it
// here. We find the read we logged at entry, record the outcome, and push a
// short result tying what Foresight flagged to how it turned out. No read (trade
// predated the worker) means there is nothing to close, so we no-op.

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
    positionId?: unknown;
    pnl?: unknown;
  };
  const connectionId =
    typeof body.connectionId === 'string' ? body.connectionId : null;
  const positionId =
    typeof body.positionId === 'string' ? body.positionId : null;
  const pnl =
    typeof body.pnl === 'number' && Number.isFinite(body.pnl) ? body.pnl : 0;
  if (!connectionId || !positionId) {
    return NextResponse.json(
      { error: 'connectionId and positionId are required.' },
      { status: 400 },
    );
  }

  const sb = createServiceClient();

  const { data: connRow } = await sb
    .from('ctrader_connections')
    .select('id, account_id, user_id')
    .eq('id', connectionId)
    .maybeSingle();
  const conn = connRow as {
    id: string;
    account_id: string;
    user_id: string;
  } | null;
  if (!conn) return NextResponse.json({ ok: true, skipped: 'no-connection' });

  const { data: readRow } = await sb
    .from('foresight_reads')
    .select('id, symbol, side, tldr, signals')
    .eq('account_id', conn.account_id)
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
    signals: Array<{ severity: string; title: string }> | null;
  } | null;
  if (!read) return NextResponse.json({ ok: true, skipped: 'no-read' });

  const outcome = Math.abs(pnl) < 0.01 ? 'BREAKEVEN' : pnl > 0 ? 'WIN' : 'LOSS';
  const won = outcome === 'WIN';

  const flags = (read.signals ?? [])
    .filter((s) => s.severity === 'warning' || s.severity === 'caution')
    .map((s) => s.title);
  const hadWarning = (read.signals ?? []).some((s) => s.severity === 'warning');
  const flagList = [...new Set(flags)].slice(0, 4).join('; ');

  const { data: acct } = await sb
    .from('accounts')
    .select('base_currency')
    .eq('id', conn.account_id)
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
        await logUsage(sb, conn.user_id, 'guard_close', AI_MODEL, usage);
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

  const { data: prof } = await sb
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', conn.user_id)
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

  return NextResponse.json({ ok: true, outcome, pnl });
}
