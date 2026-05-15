import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';

// DELETE /api/trades/[id]
//
// Deletes a single trade by id with explicit row-count verification. The
// browser supabase client previously did this delete directly, but Supabase's
// PostgREST returns *no error* when RLS silently blocks the delete or when
// the id doesn't match — the caller has no way to tell the row actually went
// away. That silent-success path was the root cause of the user's "I had to
// click delete twice" report: the first delete returned success but did
// nothing.
//
// This endpoint:
//  1. Authenticates the caller.
//  2. Issues the DELETE with `.select('id')` so PostgREST returns the affected
//     row(s).
//  3. If exactly 0 rows came back, returns 404 — the caller now knows the
//     trade was *not* removed and can show a real error instead of a
//     phantom-deleted UI state.

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

  const { id: tradeId } = await params;
  if (!tradeId) {
    return NextResponse.json({ error: 'Missing trade id' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('trades')
    .delete()
    .eq('id', tradeId)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    // Either the trade does not exist, the caller doesn't own it (blocked by
    // RLS), or it was already deleted by another tab/session. Surface this
    // instead of pretending success.
    return NextResponse.json(
      { error: 'Trade not found or already deleted.' },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: data.length });
}
