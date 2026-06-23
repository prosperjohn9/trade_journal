import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { createServiceClient } from '@/src/lib/supabase/admin';

export const runtime = 'nodejs';

// Break-glass recovery: a signed-in (aal1) user who lost their authenticator
// submits a backup code. We verify it against their stored hashes and, if valid,
// DISABLE 2FA (delete their factors) so the aal2 gate's "no verified factor"
// branch lets them back in. They then re-enroll. No aal2 required -- that is the
// whole point -- but a valid one-time code is.

function hashCode(code: string): string {
  const normalized = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) {
    return NextResponse.json({ error: 'Enter a recovery code.' }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: match } = await admin
    .from('mfa_recovery_codes')
    .select('id')
    .eq('user_id', user.id)
    .eq('code_hash', hashCode(code))
    .is('used_at', null)
    .maybeSingle();
  if (!match) {
    return NextResponse.json(
      { error: 'That recovery code is invalid or already used.' },
      { status: 400 },
    );
  }

  await admin
    .from('mfa_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', (match as { id: string }).id);

  const { error: rpcErr } = await admin.rpc('disable_user_mfa', {
    p_user_id: user.id,
  });
  if (rpcErr) {
    return NextResponse.json(
      { error: 'Could not disable two-factor. Please contact support.' },
      { status: 500 },
    );
  }

  // The remaining codes were tied to the now-removed factor; clear them.
  await admin.from('mfa_recovery_codes').delete().eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
