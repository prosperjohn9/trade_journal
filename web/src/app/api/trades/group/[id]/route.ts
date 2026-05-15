import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';

// DELETE /api/trades/group/[id]
//
// Deletes every trade that shares the given trade_group_id, then deletes the
// group row itself. RLS on `trades` still enforces ownership, so a user can
// only ever clear their own group.

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);

  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: groupId } = await params;
  if (!groupId) return NextResponse.json({ error: 'Missing group id' }, { status: 400 });

  const tradesRes = await sb
    .from('trades')
    .delete()
    .eq('trade_group_id', groupId)
    .select('id');

  if (tradesRes.error) {
    return NextResponse.json({ error: tradesRes.error.message }, { status: 500 });
  }

  const groupRes = await sb.from('trade_groups').delete().eq('id', groupId);
  if (groupRes.error) {
    return NextResponse.json({ error: groupRes.error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: tradesRes.data?.length ?? 0 });
}
