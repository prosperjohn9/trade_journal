// Telegram bot helper. Server-only: reads TELEGRAM_BOT_TOKEN (never expose it to
// the client). The bot only ever SENDS messages from the app; linking a user's
// chat happens via the webhook + a one-time code.

const API = 'https://api.telegram.org';

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

export function botUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME ?? 'foresight_alert_bot';
}

export function isTelegramConfigured(): boolean {
  return Boolean(botToken());
}

/** Send a plain-text Telegram message. Best-effort; returns true on success. */
export async function sendTelegram(
  chatId: string | number,
  text: string,
): Promise<boolean> {
  const t = botToken();
  if (!t) return false;
  try {
    const res = await fetch(`${API}/bot${t}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
