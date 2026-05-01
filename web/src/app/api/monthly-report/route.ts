import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { toNumberSafe } from '@/src/lib/utils/number';
import { computeReport, monthToRange, type TradeRow } from '@/src/lib/analytics/core';

const PROFILE_SELECT =
  'id, display_name, starting_balance, base_currency, timezone, risk_per_trade_percent, rr_win, created_at';

const ACCOUNT_SELECT =
  'id, user_id, name, account_type, tags, starting_balance, base_currency, is_default, created_at';

const TRADE_SELECT =
  'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, risk_amount, r_multiple, commission, net_pnl, reviewed_at, account_id, template_id';

function calcNetPnl(row: {
  pnl_amount: unknown;
  pnl_percent: unknown;
  commission: unknown;
  net_pnl: unknown;
  reviewed_at: unknown;
}): { netPnl: number; netPct: number } {
  const gross = Number(row.pnl_amount ?? 0);
  const grossPct = Number(row.pnl_percent ?? 0);
  const reviewed = !!row.reviewed_at;

  const grossSafe = Number.isFinite(gross) ? gross : 0;
  const grossPctSafe = Number.isFinite(grossPct) ? grossPct : 0;

  if (!reviewed) return { netPnl: grossSafe, netPct: grossPctSafe };

  const commissionRaw = Number(row.commission ?? 0);
  const commission = Number.isFinite(commissionRaw) ? commissionRaw : 0;
  const netStored = Number(row.net_pnl);
  const netPnl = Number.isFinite(netStored) ? netStored : grossSafe - commission;
  const netPct = grossSafe !== 0 ? (grossPctSafe * netPnl) / grossSafe : grossPctSafe;

  return {
    netPnl: Number.isFinite(netPnl) ? netPnl : 0,
    netPct: Number.isFinite(netPct) ? netPct : 0,
  };
}

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
  const timeZone = searchParams.get('timeZone') ?? 'UTC';
  const accountId = searchParams.get('accountId') ?? 'all';

  // Get or create profile
  const profileRes = await sb.from('profiles').select(PROFILE_SELECT).eq('id', user.id).single();
  let profile = profileRes.data;
  if (!profile && profileRes.error?.code === 'PGRST116') {
    const { data: created, error: insErr } = await sb
      .from('profiles')
      .insert({ id: user.id, display_name: null, base_currency: 'USD', timezone: 'Europe/Istanbul', risk_per_trade_percent: 1, rr_win: 2 })
      .select(PROFILE_SELECT)
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    profile = created;
  } else if (profileRes.error) {
    return NextResponse.json({ error: profileRes.error.message }, { status: 500 });
  }

  const { startIso, endIso } = monthToRange(month);

  let monthQ = sb.from('trades').select(TRADE_SELECT).eq('user_id', user.id).gte('opened_at', startIso).lt('opened_at', endIso);
  let priorQ = sb.from('trades').select('pnl_amount, pnl_percent, commission, net_pnl, reviewed_at').eq('user_id', user.id).lt('opened_at', startIso);

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

  const accounts = accountsRes.data ?? [];
  const monthRows = monthTradesRes.data ?? [];
  const priorRows = priorTradesRes.data ?? [];

  const selectedAccount =
    accountId === 'all' ? null : (accounts.find((a: { id: string }) => a.id === accountId) ?? null);

  const baseCurrency =
    (selectedAccount as { base_currency?: string | null } | null)?.base_currency ??
    (profile as { base_currency?: string | null })?.base_currency ??
    'USD';

  const allAccountsStartingBalance = accounts.reduce(
    (acc: number, a: { starting_balance: unknown }) => acc + toNumberSafe(a.starting_balance, 0),
    0,
  );

  const hasStartingBalance =
    accountId === 'all'
      ? true
      : (selectedAccount as { starting_balance?: unknown } | null)?.starting_balance !== null &&
        (selectedAccount as { starting_balance?: unknown } | null)?.starting_balance !== undefined;

  type RawTradeRow = { pnl_amount: unknown; pnl_percent: unknown; commission: unknown; net_pnl: unknown; reviewed_at: unknown; [k: string]: unknown };
  const trades: TradeRow[] = monthRows.map((r: RawTradeRow) => {
    const { netPnl, netPct } = calcNetPnl(r);
    return {
      id: String(r.id),
      opened_at: String(r.opened_at),
      instrument: r.instrument as string | null,
      direction: r.direction as 'BUY' | 'SELL' | null,
      outcome: r.outcome as 'WIN' | 'LOSS' | 'BREAKEVEN' | null,
      pnl_amount: netPnl,
      pnl_percent: netPct,
      risk_amount: r.risk_amount != null ? Number(r.risk_amount) : null,
      r_multiple: r.r_multiple != null ? Number(r.r_multiple) : null,
    };
  });

  const priorNetPnl = hasStartingBalance
    ? priorRows.reduce((acc: number, row: RawTradeRow) => acc + calcNetPnl(row).netPnl, 0)
    : 0;

  const selectedStartingBalance = selectedAccount
    ? toNumberSafe((selectedAccount as { starting_balance: unknown }).starting_balance, 0)
    : 0;

  const monthStartingBalance =
    accountId === 'all'
      ? allAccountsStartingBalance + priorNetPnl
      : hasStartingBalance
        ? selectedStartingBalance + priorNetPnl
        : null;

  const report = computeReport({
    trades,
    startingBalance: monthStartingBalance ?? 0,
    timeZone,
  });

  return NextResponse.json(
    {
      profile,
      accounts,
      selectedAccount,
      baseCurrency,
      hasStartingBalance,
      priorNetPnl,
      monthStartingBalance,
      trades,
      report,
    },
    { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=10' } },
  );
}
