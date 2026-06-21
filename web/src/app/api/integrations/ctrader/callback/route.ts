import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { exchangeCtraderCode } from '@/src/lib/integrations/ctrader';

export const runtime = 'nodejs';

// GET /api/integrations/ctrader/callback?code=..&state=..
//
// Spotware redirects here after the user grants access. We resolve the user from
// the CSRF state, exchange the code for tokens, store them once per user, and
// bounce back to the accounts page. The account list + deals are read later over
// the Protobuf socket.

const APP_ORIGIN =
  process.env.CTRADER_APP_ORIGIN ?? 'https://tradershindsight.com';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const back = (status: string) =>
    NextResponse.redirect(`${APP_ORIGIN}/settings/accounts?ctrader=${status}`);

  if (oauthError || !code || !state) return back('error');

  const admin = createServiceClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('id, ctrader_oauth_expires')
    .eq('ctrader_oauth_state', state)
    .maybeSingle();
  const p = prof as { id: string; ctrader_oauth_expires: string | null } | null;
  if (
    !p ||
    (p.ctrader_oauth_expires && new Date(p.ctrader_oauth_expires) < new Date())
  ) {
    return back('error');
  }

  try {
    const tokens = await exchangeCtraderCode(code);
    await admin.from('ctrader_oauth').upsert(
      {
        user_id: p.id,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: new Date(
          Date.now() + tokens.expiresInSec * 1000,
        ).toISOString(),
        scope: 'accounts',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    await admin
      .from('profiles')
      .update({ ctrader_oauth_state: null, ctrader_oauth_expires: null })
      .eq('id', p.id);
    return back('connected');
  } catch {
    return back('error');
  }
}
