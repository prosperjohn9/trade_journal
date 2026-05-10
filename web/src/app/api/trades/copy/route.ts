import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';

// POST /api/trades/copy
//
// Body:
// {
//   shared:  { instrument, direction, template_id, notes },
//   copies: [
//     { account_id, opened_at, outcome, pnl_amount, pnl_percent, risk_amount, r_multiple },
//     ...
//   ]
// }
//
// Creates one trade_groups row and N trades rows pointing at it, all in
// authoritative form. The shared fields are duplicated onto every trade row
// so the existing dashboard / analytics / trade-view queries keep working
// without any JOIN to the group table.

type SharedFields = {
  instrument: string;
  direction: 'BUY' | 'SELL';
  template_id: string | null;
  notes: string | null;
};

type CopyFields = {
  account_id: string;
  opened_at: string;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnl_amount: number;
  pnl_percent: number;
  risk_amount: number | null;
  r_multiple: number | null;
};

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);

  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { shared?: SharedFields; copies?: CopyFields[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const shared = body.shared;
  const copies = body.copies;

  if (!shared || !copies || !Array.isArray(copies) || copies.length < 2) {
    return NextResponse.json(
      { error: 'A copy trade needs shared fields and at least 2 accounts.' },
      { status: 400 },
    );
  }

  if (!shared.instrument?.trim()) {
    return NextResponse.json({ error: 'Instrument is required.' }, { status: 400 });
  }
  if (shared.direction !== 'BUY' && shared.direction !== 'SELL') {
    return NextResponse.json({ error: 'Invalid direction.' }, { status: 400 });
  }

  // Validate every copy upfront so we don't half-insert.
  for (const c of copies) {
    if (!c.account_id) {
      return NextResponse.json({ error: 'Each copy must have an account.' }, { status: 400 });
    }
    if (c.outcome !== 'WIN' && c.outcome !== 'LOSS' && c.outcome !== 'BREAKEVEN') {
      return NextResponse.json({ error: 'Invalid outcome on one of the copies.' }, { status: 400 });
    }
    if (!Number.isFinite(c.pnl_amount) || !Number.isFinite(c.pnl_percent)) {
      return NextResponse.json({ error: 'Invalid P&L on one of the copies.' }, { status: 400 });
    }
  }

  // 1. Create the group.
  const { data: group, error: groupErr } = await sb
    .from('trade_groups')
    .insert({ user_id: user.id })
    .select('id')
    .single();

  if (groupErr || !group) {
    return NextResponse.json(
      { error: groupErr?.message || 'Failed to create trade group.' },
      { status: 500 },
    );
  }

  // 2. Bulk-insert the N trades, all pointing at the group.
  const instrument = shared.instrument.trim().toUpperCase();
  const notes = shared.notes?.trim() ? shared.notes.trim() : null;

  const rows = copies.map((c) => ({
    user_id: user.id,
    account_id: c.account_id,
    trade_group_id: group.id,

    // shared (duplicated across all sibling rows)
    instrument,
    direction: shared.direction,
    template_id: shared.template_id || null,
    notes,

    // per-copy
    opened_at: c.opened_at,
    outcome: c.outcome,
    pnl_amount: c.pnl_amount,
    pnl_percent: c.pnl_percent,
    risk_amount: c.risk_amount,
    r_multiple: c.r_multiple,
  }));

  const { data: created, error: insertErr } = await sb
    .from('trades')
    .insert(rows)
    .select('id, account_id');

  if (insertErr) {
    // Roll back: drop the empty group so we don't leak orphan groups.
    await sb.from('trade_groups').delete().eq('id', group.id);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    groupId: group.id,
    trades: (created ?? []).map((t: { id: string; account_id: string }) => ({
      id: t.id,
      accountId: t.account_id,
    })),
  });
}
