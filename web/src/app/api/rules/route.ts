import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import type { HindsightTrade } from '@/src/lib/analytics/hindsight';
import {
  computeRuleProgress,
  ruleStatement,
  type RuleKind,
} from '@/src/lib/analytics/commitment';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET  /api/rules  -> active committed rules, each with adherence progress
// POST /api/rules  -> commit a rule { kind, subject?, label? }

const TRADE_SELECT =
  'opened_at, closed_at, outcome, pnl_amount, net_pnl, commission, volume, instrument, emotion_tag';
const VALID_KINDS: RuleKind[] = [
  'revenge',
  'oversized',
  'session',
  'weekday',
  'emotion',
  'cold_streak',
];

type Row = {
  opened_at: string;
  closed_at: string | null;
  outcome: string | null;
  pnl_amount: number | null;
  net_pnl: number | null;
  commission: number | null;
  volume: number | null;
  instrument: string | null;
  emotion_tag: string | null;
};

function toHindsightTrade(r: Row): HindsightTrade {
  const pnl =
    r.net_pnl != null
      ? Number(r.net_pnl)
      : Number(r.pnl_amount ?? 0) - Number(r.commission ?? 0);
  return {
    opened_at: r.opened_at,
    closed_at: r.closed_at,
    outcome: r.outcome,
    pnl: Number.isFinite(pnl) ? pnl : 0,
    volume: r.volume,
    instrument: r.instrument,
    emotion_tag: r.emotion_tag,
  };
}

type RuleRow = {
  id: string;
  kind: RuleKind;
  subject: string | null;
  label: string;
  committed_at: string;
};

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

  const [{ data: rulesRaw }, { data: tradesRaw }, { data: profile }] =
    await Promise.all([
      sb
        .from('trading_rules')
        .select('id, kind, subject, label, committed_at')
        .eq('status', 'active')
        .order('committed_at', { ascending: false }),
      sb.from('trades').select(TRADE_SELECT),
      sb
        .from('profiles')
        .select('base_currency, timezone')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

  const trades = ((tradesRaw ?? []) as Row[]).map(toHindsightTrade);
  const currency =
    ((profile as { base_currency?: string | null } | null)?.base_currency ??
      'USD') as string;
  const tz =
    ((profile as { timezone?: string | null } | null)?.timezone ??
      'UTC') as string;

  const rules = ((rulesRaw ?? []) as RuleRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    subject: r.subject,
    label: r.label,
    committedAt: r.committed_at,
    progress: computeRuleProgress(
      { kind: r.kind, subject: r.subject, committedAt: r.committed_at },
      trades,
      Date.now(),
      tz,
    ),
  }));

  return NextResponse.json({ currency, rules });
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

  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    subject?: unknown;
    label?: unknown;
  };
  const kind = VALID_KINDS.includes(body.kind as RuleKind)
    ? (body.kind as RuleKind)
    : null;
  if (!kind) {
    return NextResponse.json({ error: 'Unknown rule.' }, { status: 400 });
  }
  const subject =
    typeof body.subject === 'string' && body.subject.trim()
      ? body.subject.trim()
      : null;
  const label =
    typeof body.label === 'string' && body.label.trim()
      ? body.label.trim()
      : ruleStatement(kind, subject);

  // Don't create a duplicate active rule for the same leak.
  let dupQuery = sb
    .from('trading_rules')
    .select('id')
    .eq('status', 'active')
    .eq('kind', kind);
  dupQuery =
    subject === null ? dupQuery.is('subject', null) : dupQuery.eq('subject', subject);
  const { data: dup } = await dupQuery.maybeSingle();
  if (dup?.id) {
    return NextResponse.json(
      { error: 'You already committed to this rule.' },
      { status: 409 },
    );
  }

  const { data, error } = await sb
    .from('trading_rules')
    .insert({ user_id: user.id, kind, subject, label })
    .select('id, kind, subject, label, committed_at')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule: data });
}
