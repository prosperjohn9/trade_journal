import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { createServiceClient } from '@/src/lib/supabase/admin';

export const runtime = 'nodejs';

// Backup recovery codes for 2FA. GET = how many unused remain. POST = generate a
// fresh set (replacing any old one) and return the plaintext ONCE for the user to
// save; only the hashes are stored. Generating MUST be from an aal2 session.

const CODE_COUNT = 10;
// Crockford-ish alphabet: no ambiguous I/O/0/1.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(): string {
  const bytes = randomBytes(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

function hashCode(code: string): string {
  const normalized = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}

// Read the assurance level straight off the (already Supabase-verified) JWT.
function aalFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.aal === 'string' ? json.aal : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createServiceClient();
  const { count } = await admin
    .from('mfa_recovery_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('used_at', null);
  return NextResponse.json({ remaining: count ?? 0 });
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // A recovery code can later disable 2FA, so minting codes must require a fully
  // verified session -- otherwise someone with only the password could generate
  // codes and then use one to strip the second factor.
  if (aalFromToken(token) !== 'aal2') {
    return NextResponse.json(
      { error: 'Complete two-factor verification first.', code: 'aal2_required' },
      { status: 403 },
    );
  }

  const admin = createServiceClient();
  const codes = Array.from({ length: CODE_COUNT }, genCode);
  await admin.from('mfa_recovery_codes').delete().eq('user_id', user.id);
  const { error } = await admin
    .from('mfa_recovery_codes')
    .insert(codes.map((c) => ({ user_id: user.id, code_hash: hashCode(c) })));
  if (error) {
    return NextResponse.json(
      { error: 'Could not generate recovery codes.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ codes });
}
