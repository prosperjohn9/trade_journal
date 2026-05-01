import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { toNumberSafe } from '@/src/lib/utils/number';
import { monthToRange } from '@/src/lib/analytics/core';

const PROFILE_SELECT =
  'id, display_name, starting_balance, base_currency, timezone, risk_per_trade_percent, rr_win, created_at';

const ACCOUNT_SELECT =
  'id, user_id, name, account_type, tags, starting_balance, base_currency, is_default, created_at';

const TRADE_SELECT =
  'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, risk_amount, r_multiple, commission, net_pnl, reviewed_at, account_id, template_id';

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);

  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') ?? '';
  const accountId = searchParams.get('accountId') ?? 'all';

  const profileRes = await sb.from('profiles').select(PROFILE_SELECT).eq('id', user.id).single();
  let profile = profileRes.data;

  if (!profile && profileRes.error?.code === 'PGRST116') {
    const { data: created, error: insErr } = await sb
      .from('profiles')
      .insert({
        id: user.id,
        display_name: null,
        base_currency: 'USD',
        timezone: 'Europe/Istanbul',
        risk_per_trade_percent: 1,
        rr_win: 2,
      })
      .select(PROFILE_SELECT)
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    profile = created;
  } else if (profileRes.error) {
    return NextResponse.json({ error: profileRes.error.message }, { status: 500 });
  }

  const { startIso, endIso } = monthToRange(month);

  let monthQ = sb
    .from('trades')
    .select(TRADE_SELECT)
    .eq('user_id', user.id)
    .gte('opened_at', startIso)
    .lt('opened_at', endIso);

  let priorQ = sb
    .from('trades')
    .select('pnl_amount, pnl_percent, commission, net_pnl, reviewed_at')
    .eq('user_id', user.id)
    .lt('opened_at', startIso);

  if (accountId !== 'all') {
    monthQ = monthQ.eq('account_id', accountId);
    priorQ = priorQ.eq('account_id', accountId);
  }

  const [accountsRes, monthTradesRes, priorTradesRes] = await Promise.all([
    sb.from('accounts_with_tags').select(ACCOUNT_SELECT).eq('user_id', user.id).order('created_at', { ascending: true }),
    monthQ.order('opened_at', { ascending: true }),
    priorQ,
  ]);

  if (accountsRes.error) return NextResponse.json({ error: accountsRes.error.message }, { status: 500 });
  if (monthTradesRes.error) return NextResponse.json({ error: monthTradesRes.error.message }, { status: 500 });
  if (priorTradesRes.error) return NextResponse.json({ error: priorTradesRes.error.message }, { status: 500 });

  const priorRows = priorTradesRes.data ?? [];
  const priorPnlDollar = priorRows.reduce((acc: number, row: { net_pnl: number | null; pnl_amount: number | null; commission: number | null; reviewed_at: string | null }) => {
    const gross = toNumberSafe(row.pnl_amount, 0);
    if (!row.reviewed_at) return acc + gross;
    const net = Number(row.net_pnl);
    if (Number.isFinite(net)) return acc + net;
    return acc + gross - toNumberSafe(row.commission, 0);
  }, 0);

  return NextResponse.json(
    {
      userId: user.id,
      profile,
      accounts: accountsRes.data ?? [],
      trades: monthTradesRes.data ?? [],
      priorPnlDollar,
    },
    { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=10' } },
  );
}
