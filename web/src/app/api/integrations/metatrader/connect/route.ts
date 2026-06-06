import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { provisionAccount, type MtPlatform } from '@/src/lib/integrations/metaapi';
import { getServerEntitlements } from '@/src/lib/billing/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/integrations/metatrader/connect
//
// Body: { account_id, login, server, password (investor), platform: 'mt4'|'mt5' }
//
// Provisions a read-only MetaApi account for the user's MT login (MetaStats on),
// stores the mt_connections link, and returns immediately. The account takes a
// minute or two to connect to the broker; the initial backfill happens on the
// first /sync call once it's connected.

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
      {
        error: 'Broker sync requires an active plan. Subscribe to connect an account.',
        code: 'upgrade_required',
      },
      { status: 403 },
    );
  }
  const { count: syncedCount } = await sb
    .from('mt_connections')
    .select('id', { count: 'exact', head: true });
  if ((syncedCount ?? 0) >= entitlements.limits.syncedAccounts) {
    return NextResponse.json(
      {
        error: `Your plan includes ${entitlements.limits.syncedAccounts} synced accounts. Upgrade or disconnect one to add another.`,
        code: 'limit_reached',
      },
      { status: 403 },
    );
  }

  let body: {
    account_id?: string;
    login?: string;
    server?: string;
    password?: string;
    platform?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const account_id = body.account_id?.trim();
  const login = body.login?.trim();
  const server = body.server?.trim();
  const password = body.password ?? '';
  const platform: MtPlatform = body.platform === 'mt4' ? 'mt4' : 'mt5';

  if (!account_id || !login || !server || !password) {
    return NextResponse.json(
      { error: 'Trading account, login, server and password are all required.' },
      { status: 400 },
    );
  }

  // Confirm the target trading account belongs to this user (RLS-scoped).
  const { data: acct, error: acctErr } = await sb
    .from('accounts')
    .select('id, name')
    .eq('id', account_id)
    .single();
  if (acctErr || !acct) {
    return NextResponse.json({ error: 'Trading account not found.' }, { status: 404 });
  }

  let provisioned: { metaApiAccountId: string; state: string; region: string };
  try {
    provisioned = await provisionAccount({
      name: `TH ${acct.name} (${login})`.slice(0, 64),
      login,
      password,
      server,
      platform,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not connect to the broker.' },
      { status: 502 },
    );
  }

  const { data: conn, error: insErr } = await sb
    .from('mt_connections')
    .insert({
      user_id: user.id,
      account_id,
      metaapi_account_id: provisioned.metaApiAccountId,
      login,
      server,
      platform,
      region: provisioned.region,
      state: 'pending',
    })
    .select('id')
    .single();

  if (insErr || !conn) {
    return NextResponse.json(
      { error: insErr?.message || 'Failed to save the connection.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    connectionId: conn.id,
    metaApiAccountId: provisioned.metaApiAccountId,
    state: provisioned.state,
  });
}
