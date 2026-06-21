import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import {
  buildCtraderAuthUrl,
  isCtraderConfigured,
} from '@/src/lib/integrations/ctrader';

export const runtime = 'nodejs';

// GET /api/integrations/ctrader/connect -> { url }
//
// Starts the cTrader OAuth flow: mints a CSRF state tied to the user (stored on
// their profile, like the Telegram link code) and returns the Spotware consent
// URL for the client to redirect to. The callback resolves the user by state.

export async function GET(request: Request) {
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

  const state = randomBytes(16).toString('base64url');
  const { error } = await sb
    .from('profiles')
    .update({
      ctrader_oauth_state: state,
      ctrader_oauth_expires: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    .eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ url: buildCtraderAuthUrl(state) });
}
