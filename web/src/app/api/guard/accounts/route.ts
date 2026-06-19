import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { DEFAULT_MT_REGION } from '@/src/lib/integrations/metaapi';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';
import { adminUserIdSet } from '@/src/lib/auth/admin';

export const runtime = 'nodejs';

// GET /api/guard/accounts  (worker-only)
//
// The always-on worker calls this to learn which MetaTrader accounts have
// Foresight enabled and should be watched. Worker-authenticated by the shared
// WORKER_SECRET; returns only the ids the worker needs (no PII). Dead states
// (breached, over the synced-account cap) are filtered out, and each user is
// capped to their paid guardrail seats (oldest-enabled first), so a lapsed seat
// stops the worker watching that account even if the flag is still on. Admins
// are unlimited.

type Conn = {
  id: string;
  account_id: string;
  metaapi_account_id: string | null;
  region: string | null;
  state: string | null;
  user_id: string;
  created_at: string | null;
};

export async function GET(request: Request) {
  const workerSecret = process.env.WORKER_SECRET;
  if (
    !workerSecret ||
    request.headers.get('x-worker-secret') !== workerSecret
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('mt_connections')
    .select(
      'id, account_id, metaapi_account_id, region, state, user_id, created_at',
    )
    .eq('guard_enabled', true)
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dead = new Set(['breached', 'over_limit']);
  const live = ((data ?? []) as Conn[]).filter(
    (c) => c.metaapi_account_id && !dead.has(c.state ?? ''),
  );

  // Per-user seat caps. A user may run Foresight on at most as many accounts as
  // they have paid guardrail seats; admins are unlimited.
  const userIds = [...new Set(live.map((c) => c.user_id))];
  const seatsByUser = new Map<string, number>();
  if (userIds.length) {
    const { data: subs } = await sb
      .from('subscriptions')
      .select(`user_id, ${SUBSCRIPTION_SELECT}`)
      .in('user_id', userIds);
    for (const s of (subs ?? []) as Array<SubscriptionRow & { user_id: string }>) {
      seatsByUser.set(s.user_id, resolveEntitlements(s).limits.guardrailSeats);
    }
  }
  const adminIds = await adminUserIdSet(sb);

  const usedByUser = new Map<string, number>();
  const accounts = [];
  for (const c of live) {
    // live is oldest-first, so seats go to the accounts enabled earliest.
    if (!adminIds.has(c.user_id)) {
      const seats = seatsByUser.get(c.user_id) ?? 0;
      const used = usedByUser.get(c.user_id) ?? 0;
      if (used >= seats) continue;
      usedByUser.set(c.user_id, used + 1);
    }
    accounts.push({
      connectionId: c.id,
      accountId: c.account_id,
      metaApiAccountId: c.metaapi_account_id as string,
      region: c.region ?? DEFAULT_MT_REGION,
      userId: c.user_id,
    });
  }

  return NextResponse.json({ accounts });
}
