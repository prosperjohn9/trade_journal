import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { DEFAULT_MT_REGION } from '@/src/lib/integrations/metaapi';

export const runtime = 'nodejs';

// GET /api/guard/accounts  (worker-only)
//
// The always-on worker calls this to learn which MetaTrader accounts have
// Foresight enabled and should be watched. Worker-authenticated by the shared
// WORKER_SECRET; returns only the ids the worker needs (no PII). Dead states
// (breached, over the synced-account cap) are filtered out so the worker never
// keeps a suspended account deployed.

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
    .select('id, account_id, metaapi_account_id, region, state, user_id')
    .eq('guard_enabled', true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dead = new Set(['breached', 'over_limit']);
  const accounts = (
    (data ?? []) as Array<{
      id: string;
      account_id: string;
      metaapi_account_id: string | null;
      region: string | null;
      state: string | null;
      user_id: string;
    }>
  )
    .filter((c) => c.metaapi_account_id && !dead.has(c.state ?? ''))
    .map((c) => ({
      connectionId: c.id,
      accountId: c.account_id,
      metaApiAccountId: c.metaapi_account_id as string,
      region: c.region ?? DEFAULT_MT_REGION,
      userId: c.user_id,
    }));

  return NextResponse.json({ accounts });
}
