import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { ctraderReadUsage } from '@/src/lib/analytics/foresightCap';

export const runtime = 'nodejs';

// GET /api/guard/ctrader/usage
//
// This month's free cTrader Foresight read usage for the signed-in user, so the
// /foresight page can show "X of N reads used this month". cTrader-only; the
// paid MetaTrader guardrail is uncapped.

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await ctraderReadUsage(sb, user.id));
}
