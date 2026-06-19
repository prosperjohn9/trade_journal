import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { getServerEntitlements } from '@/src/lib/billing/server';

export const runtime = 'nodejs';

// POST /api/guard/toggle  { connectionId, on }
//
// Turn real-time Foresight on/off for one MetaTrader connection. Enabling is
// gated on paid guardrail seats: a user may guard at most as many MetaTrader
// accounts as they have seats (admins are unlimited). Turning it off is always
// allowed. This is the UX gate; the worker's account list also caps to seats, so
// a lapsed seat stops watching even if the flag stays on.

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

  const body = (await request.json().catch(() => ({}))) as {
    connectionId?: unknown;
    on?: unknown;
  };
  const connectionId =
    typeof body.connectionId === 'string' ? body.connectionId : null;
  const on = body.on === true;
  if (!connectionId) {
    return NextResponse.json(
      { error: 'connectionId is required.' },
      { status: 400 },
    );
  }

  // The connection must be the user's (RLS scopes this anyway).
  const { data: conn } = await sb
    .from('mt_connections')
    .select('id')
    .eq('id', connectionId)
    .maybeSingle();
  if (!conn) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  if (on) {
    const ent = await getServerEntitlements(sb);
    if (!ent.features.ai) {
      return NextResponse.json(
        { error: 'Foresight requires an active plan.', code: 'upgrade_required' },
        { status: 403 },
      );
    }
    // How many of this user's accounts already have Foresight on (RLS-scoped).
    const { count } = await sb
      .from('mt_connections')
      .select('id', { count: 'exact', head: true })
      .eq('guard_enabled', true)
      .neq('id', connectionId);
    const used = count ?? 0;
    if (used + 1 > ent.limits.guardrailSeats) {
      return NextResponse.json(
        {
          code: 'guardrail_seat_required',
          error:
            ent.limits.guardrailSeats === 0
              ? 'Real-time Foresight is a $18/month per-account add-on. Buy a seat under Settings, Billing to turn it on.'
              : `You are using all ${ent.limits.guardrailSeats} of your Foresight seats. Buy another under Settings, Billing to guard this account too.`,
        },
        { status: 403 },
      );
    }
  }

  const { error } = await sb
    .from('mt_connections')
    .update({ guard_enabled: on })
    .eq('id', connectionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, guard_enabled: on });
}
