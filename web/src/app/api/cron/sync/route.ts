import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { syncConnection, type SyncConnection } from '@/src/lib/integrations/sync';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/cron/sync
//
// Scheduled by Supabase pg_cron (via pg_net). Syncs every connected MetaTrader
// account that is "due" based on its owner's plan sync interval (Pro 4h, Elite
// 2h, Master 1h). Not entitled = never synced. Authorized with CRON_SECRET.

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header =
    request.headers.get('authorization') ??
    request.headers.get('x-cron-secret');
  return header === secret || header === `Bearer ${secret}`;
}

type DueConnection = SyncConnection & {
  user_id: string;
  last_synced_at: string | null;
};

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const [{ data: connections }, { data: subs }] = await Promise.all([
    admin
      .from('mt_connections')
      .select('id, account_id, metaapi_account_id, region, last_synced_at, user_id'),
    admin.from('subscriptions').select(`user_id, ${SUBSCRIPTION_SELECT}`),
  ]);

  // Per-user sync interval in hours (0 = not entitled, skip).
  const intervalByUser = new Map<string, number>();
  for (const s of (subs ?? []) as Array<SubscriptionRow & { user_id: string }>) {
    const ent = resolveEntitlements(s);
    intervalByUser.set(
      s.user_id,
      ent.entitled ? ent.limits.syncIntervalHours : 0,
    );
  }

  const now = Date.now();
  const due = ((connections ?? []) as DueConnection[]).filter((c) => {
    const interval = intervalByUser.get(c.user_id) ?? 0;
    if (interval <= 0) return false;
    if (!c.last_synced_at) return true;
    const elapsedHours =
      (now - new Date(c.last_synced_at).getTime()) / 3_600_000;
    return elapsedHours >= interval;
  });

  const results = [];
  for (const c of due) {
    results.push(await syncConnection(admin, c, c.user_id));
  }

  return NextResponse.json({ due: due.length, results });
}
