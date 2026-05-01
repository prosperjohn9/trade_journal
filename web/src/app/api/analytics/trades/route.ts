import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';

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
  const startIso = searchParams.get('startIso') ?? '';
  const endIso = searchParams.get('endIso') ?? '';
  const accountId = searchParams.get('accountId') ?? 'all';
  const direction = searchParams.get('direction') ?? '';
  const outcome = searchParams.get('outcome') ?? '';
  const reviewedFilter = searchParams.get('reviewedFilter') ?? '';
  const setupFilter = searchParams.get('setupFilter') ?? '';
  const instrumentQuery = searchParams.get('instrumentQuery') ?? '';

  let q = sb
    .from('trades')
    .select(
      `id, opened_at, closed_at,
       instrument, direction, outcome,
       pnl_amount, pnl_percent,
       commission, net_pnl, r_multiple,
       reviewed_at, template_id`,
    )
    .gte('opened_at', startIso)
    .lte('opened_at', endIso);

  if (accountId && accountId !== 'all') q = q.eq('account_id', accountId);
  if (direction) q = q.eq('direction', direction);
  if (outcome) q = q.eq('outcome', outcome);
  if (reviewedFilter === 'REVIEWED') q = q.not('reviewed_at', 'is', null);
  else if (reviewedFilter === 'NOT_REVIEWED') q = q.is('reviewed_at', null);
  if (setupFilter === 'NO_SETUP') q = q.is('template_id', null);
  else if (setupFilter) q = q.eq('template_id', setupFilter);
  if (instrumentQuery) q = q.ilike('instrument', `%${instrumentQuery}%`);

  const { data, error } = await q.order('opened_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
