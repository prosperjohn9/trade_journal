import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import { sendTelegram } from '@/src/lib/integrations/telegram';

export const runtime = 'nodejs';

// POST /api/telegram/webhook  -> Telegram update receiver.
//
// Set once via Telegram's setWebhook (with secret_token). Handles the "/start
// <code>" deep link: matches the code to a profile and stores the chat id, so
// the user is linked without ever typing it. Telegram authenticity is checked
// via the secret token header.

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    secret &&
    request.headers.get('x-telegram-bot-api-secret-token') !== secret
  ) {
    // Not from Telegram (or misconfigured). Acknowledge so nothing retries.
    return NextResponse.json({ ok: true });
  }

  const update = (await request.json().catch(() => null)) as {
    message?: { text?: unknown; chat?: { id?: unknown } };
  } | null;
  const msg = update?.message;
  const text = typeof msg?.text === 'string' ? msg.text : '';
  const idRaw = msg?.chat?.id;
  const chatId =
    typeof idRaw === 'number' || typeof idRaw === 'string' ? idRaw : null;

  if (chatId != null && text.startsWith('/start')) {
    const code = text.split(/\s+/)[1];
    const admin = createServiceClient();
    if (code) {
      const { data: prof } = await admin
        .from('profiles')
        .select('id, telegram_link_expires')
        .eq('telegram_link_code', code)
        .maybeSingle();
      const p = prof as
        | { id: string; telegram_link_expires: string | null }
        | null;
      if (
        p &&
        (!p.telegram_link_expires ||
          new Date(p.telegram_link_expires) > new Date())
      ) {
        await admin
          .from('profiles')
          .update({
            telegram_chat_id: String(chatId),
            telegram_link_code: null,
            telegram_link_expires: null,
          })
          .eq('id', p.id);
        await sendTelegram(
          chatId,
          'Foresight is linked. You will get a read here the instant you open a trade on a guarded account.',
        );
      } else {
        await sendTelegram(
          chatId,
          "That link expired. In The Trader's Hindsight, open Settings and tap Connect Telegram again.",
        );
      }
    } else {
      await sendTelegram(
        chatId,
        "Hi. To link Foresight, open Settings in The Trader's Hindsight and tap Connect Telegram.",
      );
    }
  }

  return NextResponse.json({ ok: true });
}
