import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';

export const runtime = 'nodejs';

// POST /api/guard/ctrader/toggle  { accountId | connectionId, enabled }
//
// Turn Foresight on/off for a cTrader account. cTrader guard is free (no
// per-account hosting cost), so there is no paid seat gate here, unlike the
// MetaTrader toggle. RLS scopes the update to the caller's own connection.

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
    accountId?: unknown;
    connectionId?: unknown;
    enabled?: unknown;
  };
  const accountId = typeof body.accountId === 'string' ? body.accountId : null;
  const connectionId =
    typeof body.connectionId === 'string' ? body.connectionId : null;
  const enabled = body.enabled === true;
  if (!accountId && !connectionId) {
    return NextResponse.json(
      { error: 'accountId or connectionId is required.' },
      { status: 400 },
    );
  }

  let q = sb
    .from('ctrader_connections')
    .update({ guard_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  q = connectionId ? q.eq('id', connectionId) : q.eq('account_id', accountId as string);
  const { data, error } = await q.select('id, guard_enabled');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || !data.length) {
    return NextResponse.json(
      { error: 'No cTrader account found.' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, guardEnabled: enabled });
}
