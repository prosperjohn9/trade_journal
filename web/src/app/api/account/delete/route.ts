import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { createServiceClient } from '@/src/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/account/delete
//
// Full account self-deletion. Replaces the old delete_my_account() RPC:
// Supabase now blocks SQL deletes on storage tables ("use the Storage API
// instead"), so we remove the user's files through the Storage API and then
// delete the auth user with the admin API; ON DELETE CASCADE wipes every
// domain table.

const BUCKET = 'trade-screenshots';

async function removeUserFolder(
  admin: ReturnType<typeof createServiceClient>,
  prefix: string,
): Promise<void> {
  // Screenshots live flat under before/{userId}/ and after/{userId}/.
  const { data: files } = await admin.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000 });
  if (files && files.length) {
    await admin.storage
      .from(BUCKET)
      .remove(files.map((f) => `${prefix}/${f.name}`));
  }
}

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

  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  try {
    // Storage first (no cascade covers storage objects).
    await removeUserFolder(admin, `before/${user.id}`);
    await removeUserFolder(admin, `after/${user.id}`);

    // Then the auth user; cascade rules clean up every domain table.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Account deletion failed', e);
    return NextResponse.json(
      { error: 'Could not delete the account. Please try again.' },
      { status: 500 },
    );
  }
}
