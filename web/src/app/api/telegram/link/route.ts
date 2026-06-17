import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import { botUsername, isTelegramConfigured } from '@/src/lib/integrations/telegram';

export const runtime = 'nodejs';

// GET  /api/telegram/link  -> { linked, configured }
// POST /api/telegram/link  -> { url }  (a one-time deep link to the bot)
//
// The deep link carries a short code; pressing Start in Telegram hits the
// webhook, which matches the code back to this user and stores their chat id.

async function authed(request: Request) {
  const token = getToken(request);
  if (!token) return null;
  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user ? { sb, user } : null;
}

export async function GET(request: Request) {
  const ctx = await authed(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data } = await ctx.sb
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', ctx.user.id)
    .maybeSingle();
  return NextResponse.json({
    linked: Boolean(
      (data as { telegram_chat_id?: string | null } | null)?.telegram_chat_id,
    ),
    configured: isTelegramConfigured(),
  });
}

export async function POST(request: Request) {
  const ctx = await authed(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { error: 'Telegram is not configured yet.' },
      { status: 503 },
    );
  }
  const code = randomBytes(16).toString('base64url');
  const { error } = await ctx.sb
    .from('profiles')
    .update({
      telegram_link_code: code,
      telegram_link_expires: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    .eq('id', ctx.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: `https://t.me/${botUsername()}?start=${code}` });
}
