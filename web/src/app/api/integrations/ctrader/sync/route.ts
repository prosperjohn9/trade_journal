import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { isCtraderConfigured } from '@/src/lib/integrations/ctrader';
import { syncCtraderForUser } from '@/src/lib/integrations/ctraderSync';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/integrations/ctrader/sync
//
// Discover the user's cTrader accounts over the Open API socket and pull their
// deal history into trades. cTrader sync is free (no per-account hosting cost),
// so there is no synced-account cap to enforce.

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
  if (!isCtraderConfigured()) {
    return NextResponse.json(
      { error: 'cTrader is not configured yet.' },
      { status: 503 },
    );
  }

  try {
    const admin = createServiceClient();
    const result = await syncCtraderForUser(admin, user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'cTrader sync failed.' },
      { status: 502 },
    );
  }
}
