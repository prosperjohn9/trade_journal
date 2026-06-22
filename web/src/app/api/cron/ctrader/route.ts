import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { isCtraderConfigured } from '@/src/lib/integrations/ctrader';
import { syncCtraderForUser } from '@/src/lib/integrations/ctraderSync';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';
import { adminUserIdSet } from '@/src/lib/auth/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/cron/ctrader
//
// Scheduled by Supabase pg_cron (every 6h via pg_net). Each run refreshes a few
// "due" users' cTrader accounts over the Open API socket, oldest-due first.
// cTrader sync is free (no per-account hosting), so this has no synced-account
// cap and is gated only on an entitled subscription (admins always included).
// Separate from /api/cron/sync because the socket flow needs its own 60s budget.

const DUE_HOURS = 20; // ~once per day, with slack for the 6h tick cadence
const MAX_PER_RUN = 4; // bound the run against the 60s function limit

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header =
    request.headers.get('authorization') ??
    request.headers.get('x-cron-secret');
  return header === secret || header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isCtraderConfigured()) {
    return NextResponse.json({ skipped: 'cTrader not configured' });
  }

  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const [{ data: oauthRows }, { data: subs }] = await Promise.all([
    admin.from('ctrader_oauth').select('user_id, last_synced_at'),
    admin.from('subscriptions').select(`user_id, ${SUBSCRIPTION_SELECT}`),
  ]);

  const entitled = new Set<string>();
  for (const s of (subs ?? []) as Array<SubscriptionRow & { user_id: string }>) {
    if (resolveEntitlements(s).entitled) entitled.add(s.user_id);
  }
  // The owner/admin always auto-syncs regardless of subscription.
  for (const id of await adminUserIdSet(admin)) entitled.add(id);

  const now = Date.now();
  const hoursSince = (iso: string | null) =>
    iso ? (now - new Date(iso).getTime()) / 3_600_000 : Infinity;

  const due = ((oauthRows ?? []) as Array<{
    user_id: string;
    last_synced_at: string | null;
  }>)
    .filter((o) => entitled.has(o.user_id) && hoursSince(o.last_synced_at) >= DUE_HOURS)
    // Most overdue first (never-synced sorts to the front).
    .sort((a, b) => hoursSince(b.last_synced_at) - hoursSince(a.last_synced_at));

  const batch = due.slice(0, MAX_PER_RUN);

  const results: Array<Record<string, unknown>> = [];
  for (const o of batch) {
    // Stamp the attempt up front so a hang or failure backs off until next day
    // (the user can still trigger a manual sync immediately).
    await admin
      .from('ctrader_oauth')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', o.user_id);
    try {
      const r = await syncCtraderForUser(admin, o.user_id);
      const imported = (r.accounts ?? []).reduce((s, a) => s + a.imported, 0);
      results.push({ user: o.user_id, accounts: r.accounts?.length ?? 0, imported });
    } catch (e) {
      results.push({
        user: o.user_id,
        error: e instanceof Error ? e.message : 'cTrader sync failed',
      });
    }
  }

  return NextResponse.json({
    dueTotal: due.length,
    processed: batch.length,
    results,
  });
}
