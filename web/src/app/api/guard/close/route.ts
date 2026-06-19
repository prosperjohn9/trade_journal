import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  fetchHistoricalDeals,
  DEFAULT_MT_REGION,
} from '@/src/lib/integrations/metaapi';
import { sendTelegram } from '@/src/lib/integrations/telegram';

export const runtime = 'nodejs';
export const maxDuration = 30;

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
    .select('id, account_id, metaapi_account_id, region, user_id');
  if (connectionId) q = q.eq('id', connectionId);
  else if (accountIdIn) q = q.eq('account_id', accountIdIn);
  const { data: conn } = await q.maybeSingle();
  const c = conn as {
    id: string;
    account_id: string;
    metaapi_account_id: string | null;
    region: string | null;
    user_id: string;
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
  try {
    const region = c.region ?? DEFAULT_MT_REGION;
    const deals = await fetchHistoricalDeals({
      metaApiAccountId: c.metaapi_account_id,
      region,
      from: new Date(Date.now() - 30 * 60_000),
      to: new Date(Date.now() + 60_000),
    });
    for (const d of deals) {
      if (d.positionId !== positionId) continue;
      pnl += Number(d.profit ?? 0) + Number(d.commission ?? 0) + Number(d.swap ?? 0);
    }
  } catch {
    // If the deal feed is briefly unavailable we still record the close, just
    // without a P&L figure.
    pnl = 0;
  }

  const outcome =
    Math.abs(pnl) < 0.01 ? 'BREAKEVEN' : pnl > 0 ? 'WIN' : 'LOSS';
  const won = outcome === 'WIN';

  // Tie the result back to what Foresight flagged at entry. This is the Hindsight
  // payoff: a win on a flagged trade is a reinforced leak, not a green light; a
  // loss on a clean read is just variance.
  const flags = (read.signals ?? [])
    .filter((s) => s.severity === 'warning' || s.severity === 'caution')
    .map((s) => s.title);
  const hadWarning = (read.signals ?? []).some((s) => s.severity === 'warning');
  const flagList = [...new Set(flags)].slice(0, 4).join('; ');

  let outcomeNote: string;
  if (outcome === 'BREAKEVEN') {
    outcomeNote = 'Closed roughly flat.';
  } else if (flags.length === 0) {
    outcomeNote = won
      ? 'Nothing was flagged at entry and it came in. Process and result lined up, this is what a clean trade looks like.'
      : 'Nothing was flagged at entry, so this is a normal losing trade, not a behavioural leak. Part of the game; do not overcorrect.';
  } else if (won) {
    outcomeNote = `It worked out, but Foresight flagged ${flags.length} thing${flags.length === 1 ? '' : 's'} at entry: ${flagList}. Those were real risks, not the reason you won. Winning on a flagged trade is exactly how a leak gets reinforced, so judge this by the process, not the green number.`;
  } else {
    outcomeNote = `The risks flagged at entry showed up: ${flagList}. ${hadWarning ? 'The warning there is a leak to fix, not bad luck.' : 'Worth reviewing whether those cautions made the difference.'}`;
  }

  await sb
    .from('foresight_reads')
    .update({
      outcome,
      closed_pnl: Math.round(pnl * 100) / 100,
      outcome_note: outcomeNote,
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
    const { data: acct } = await sb
      .from('accounts')
      .select('currency')
      .eq('id', c.account_id)
      .maybeSingle();
    const currency =
      (acct as { currency?: string | null } | null)?.currency ?? 'USD';
    const verb =
      outcome === 'WIN'
        ? 'closed in profit'
        : outcome === 'LOSS'
          ? 'closed at a loss'
          : 'closed flat';
    const head = `${read.symbol} ${read.side} ${verb}: ${signed(pnl)} ${currency}`;
    const entry = read.tldr ? `\n\nAt entry: ${read.tldr}` : '';
    await sendTelegram(chatId, `${head}${entry}\n\n${outcomeNote}`);
  }

  return NextResponse.json({ ok: true, outcome, pnl });
}
