import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { isTf } from '@/src/lib/analytics/timeframes';

export const runtime = 'nodejs';

// POST /api/guard/ctrader/settings  { connectionId, analyzedTf, executedTf, setupId }
//
// Save the per-account Foresight read context for a cTrader account (analysis
// timeframe, execution timeframe, tagged setup), exactly like the MetaTrader
// version. The worker reads these so its auto-fired reads use the trader's real
// timeframes. Each value may be null/empty to clear it. RLS scopes the update.

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
    connectionId?: unknown;
    analyzedTf?: unknown;
    executedTf?: unknown;
    setupId?: unknown;
  };
  const connectionId =
    typeof body.connectionId === 'string' ? body.connectionId : null;
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId is required.' }, { status: 400 });
  }

  const guard_analyzed_tf = isTf(body.analyzedTf) ? body.analyzedTf : null;
  const guard_executed_tf = isTf(body.executedTf) ? body.executedTf : null;
  const guard_setup_id =
    typeof body.setupId === 'string' && body.setupId ? body.setupId : null;

  const { error } = await sb
    .from('ctrader_connections')
    .update({ guard_analyzed_tf, guard_executed_tf, guard_setup_id })
    .eq('id', connectionId)
    .eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
