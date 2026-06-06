import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { getServerEntitlements } from '@/src/lib/billing/server';
import { syncConnection, type SyncConnection } from '@/src/lib/integrations/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/integrations/metatrader/sync
//
// Body (optional): { connectionId } — sync just one connection, else all of the
// user's connections. Pulls paired trades from MetaStats, dedups on external_id,
// and inserts new ones into the linked trading account.

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const entitlements = await getServerEntitlements(sb);
  if (!entitlements.features.sync) {
    return NextResponse.json(
      { error: 'Broker sync requires an active plan.', code: 'upgrade_required' },
      { status: 403 },
    );
  }

  let body: { connectionId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  let query = sb
    .from('mt_connections')
    .select('id, account_id, metaapi_account_id, region')
    .eq('user_id', user.id);
  if (body.connectionId) query = query.eq('id', body.connectionId);

  const { data: connections, error: connErr } = await query;
  if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 });

  const results = [];
  for (const c of (connections ?? []) as SyncConnection[]) {
    results.push(await syncConnection(sb, c, user.id));
  }

  return NextResponse.json({ results });
}
