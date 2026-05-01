import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';

const PROFILE_SELECT =
  'id, display_name, starting_balance, base_currency, timezone, risk_per_trade_percent, rr_win, created_at';

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);

  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profileRes = await sb
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', user.id)
    .single();

  let profile = profileRes.data;

  if (!profile && profileRes.error?.code === 'PGRST116') {
    const { data: created, error: insErr } = await sb
      .from('profiles')
      .insert({
        id: user.id,
        display_name: null,
        base_currency: 'USD',
        timezone: 'Europe/Istanbul',
        risk_per_trade_percent: 1,
        rr_win: 2,
      })
      .select(PROFILE_SELECT)
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    profile = created;
  } else if (profileRes.error) {
    return NextResponse.json({ error: profileRes.error.message }, { status: 500 });
  }

  const [templatesRes, accountsRes] = await Promise.all([
    sb.from('setup_templates').select('id, name, is_default').order('created_at', { ascending: true }),
    sb
      .from('accounts_with_tags')
      .select('id, user_id, name, account_type, tags, starting_balance, base_currency, is_default, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ]);

  if (templatesRes.error)
    return NextResponse.json({ error: templatesRes.error.message }, { status: 500 });
  if (accountsRes.error)
    return NextResponse.json({ error: accountsRes.error.message }, { status: 500 });

  return NextResponse.json({
    profile,
    setupTemplates: (templatesRes.data ?? []).map((t: { id: string; name: string; is_default: boolean }) => ({
      id: t.id,
      name: t.name,
      is_default: !!t.is_default,
    })),
    accounts: (accountsRes.data ?? []).map((a: { id: string; name: string; is_default: boolean }) => ({
      id: a.id,
      name: a.name,
      is_default: !!a.is_default,
    })),
  });
}
