import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { getServerEntitlements } from '@/src/lib/billing/server';
import {
  syncConnection,
  manualRefreshCount,
  logRefresh,
  type SyncConnection,
} from '@/src/lib/integrations/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/integrations/metatrader/sync
//
// Body (optional): { connectionId } — refresh just one connection, else all of
// the user's connections. Each account refresh is a metered MetaApi deploy,
// counted against the plan's monthly manual-refresh allowance.

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
    .select(
      'id, account_id, metaapi_account_id, region, last_synced_at, guard_enabled',
    )
    .eq('user_id', user.id)
    // Breached and over-limit accounts were auto-disconnected; their MetaApi
    // account is gone, so a sync attempt would only produce a confusing error.
    .neq('state', 'breached')
    .neq('state', 'over_limit');
  if (body.connectionId) query = query.eq('id', body.connectionId);

  const { data: connections, error: connErr } = await query;
  if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 });

  const conns = (connections ?? []) as SyncConnection[];

  // Manual refreshes are metered: each one is a real MetaApi deploy. Block once
  // the monthly allowance is spent; otherwise sync at most the remaining count.
  const limit = entitlements.limits.manualRefreshesPerMonth;
  const used = await manualRefreshCount(sb, user.id);
  if (used >= limit) {
    return NextResponse.json(
      {
        error: `You have used all ${limit} manual refreshes this month. They reset on the 1st, or upgrade for more.`,
        code: 'manual_refresh_limit',
      },
      { status: 429 },
    );
  }

  const toSync = conns.slice(0, limit - used);
  const skipped = conns.length - toSync.length;

  const results = [];
  for (const c of toSync) {
    const r = await syncConnection(sb, c, user.id);
    results.push(r);
    // Count a refresh only when it actually completed (a real deploy + fetch). A
    // "still connecting" result pulled nothing, so it does not count.
    if (!r.error) await logRefresh(sb, user.id, c.id, 'manual');
  }
  const charged = results.filter((r) => !r.error).length;

  return NextResponse.json({
    results,
    skipped,
    manualRefreshesUsed: used + charged,
    manualRefreshesLimit: limit,
  });
}
