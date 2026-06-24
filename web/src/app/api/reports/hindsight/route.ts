import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import {
  computeHindsightReport,
  type HindsightTrade,
} from '@/src/lib/analytics/hindsight';
import {
  buildPnlNormalizer,
  type PnlNormalizer,
} from '@/src/lib/analytics/normalizePnl';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /api/reports/hindsight
//
// The Hindsight Report: counterfactual P&L over the last 30 days (falls back to
// all time when the recent sample is thin). Pure math on the caller's own
// trades under RLS; no AI spend, available on every plan. P&L is normalized to
// the user's display currency so mixed-currency accounts don't blend.

const TRADE_SELECT =
  'account_id, opened_at, closed_at, outcome, pnl_amount, net_pnl, commission, volume, emotion_tag';
const DEFAULT_DAYS = 30;
const MIN_TRADES = 10;

type Row = {
  account_id: string | null;
  opened_at: string;
  closed_at: string | null;
  outcome: string | null;
  pnl_amount: number | null;
  net_pnl: number | null;
  commission: number | null;
  volume: number | null;
  emotion_tag: string | null;
};

function toHindsightTrade(r: Row, fx: PnlNormalizer): HindsightTrade {
  const raw =
    r.net_pnl != null
      ? Number(r.net_pnl)
      : Number(r.pnl_amount ?? 0) - Number(r.commission ?? 0);
  const pnl = fx.toDisplay(Number.isFinite(raw) ? raw : 0, r.account_id);
  return {
    opened_at: r.opened_at,
    closed_at: r.closed_at,
    outcome: r.outcome,
    pnl: Number.isFinite(pnl) ? pnl : 0,
    volume: r.volume,
    emotion_tag: r.emotion_tag,
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
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = new Date(
    Date.now() - DEFAULT_DAYS * 86_400_000,
  ).toISOString();

  const [{ data: recentRaw }, { data: profile }] = await Promise.all([
    sb.from('trades').select(TRADE_SELECT).gte('opened_at', since),
    sb
      .from('profiles')
      .select('base_currency, timezone')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  let rows = (recentRaw ?? []) as Row[];
  let period: '30d' | 'all' = '30d';

  // Thin recent sample: widen to the full journal so the report stays useful.
  if (rows.length < MIN_TRADES) {
    const { data: allRaw } = await sb.from('trades').select(TRADE_SELECT);
    rows = (allRaw ?? []) as Row[];
    period = 'all';
  }

  if (rows.length < MIN_TRADES) {
    return NextResponse.json({
      insufficient: true,
      totalTrades: rows.length,
      minTrades: MIN_TRADES,
    });
  }

  const currency =
    ((profile as { base_currency?: string | null } | null)?.base_currency ??
      'USD') as string;
  const tz =
    ((profile as { timezone?: string | null } | null)?.timezone ??
      'UTC') as string;
  const fx = await buildPnlNormalizer(sb, user.id, currency);
  const report = computeHindsightReport(
    rows.map((r) => toHindsightTrade(r, fx)),
    tz,
  );

  return NextResponse.json({ insufficient: false, period, currency, report });
}
