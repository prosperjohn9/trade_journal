import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { removeMetaApiAccount } from '@/src/lib/integrations/metaapi';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/integrations/metatrader/disconnect
//
// Body: { connectionId }
//
// Removes the MetaApi account (stops its meter) and deletes the connection so
// auto-sync stops, but keeps every imported trade + balance event in our DB.

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { connectionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const connectionId = body.connectionId?.trim();
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId is required.' }, { status: 400 });
  }

  const { data: conn, error: connErr } = await sb
    .from('mt_connections')
    .select('id, metaapi_account_id')
    .eq('id', connectionId)
    .single();
  if (connErr || !conn) {
    return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
  }

  // Best-effort removal on MetaApi (stops the meter); never block the local
  // disconnect on it.
  try {
    await removeMetaApiAccount(conn.metaapi_account_id);
  } catch {
    // ignore — we still drop the connection locally
  }

  const { error: delErr } = await sb
    .from('mt_connections')
    .delete()
    .eq('id', connectionId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
