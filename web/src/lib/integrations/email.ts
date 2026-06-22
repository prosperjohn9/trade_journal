// Transactional email via the Resend HTTP API. Env-gated on RESEND_API_KEY: when
// it is unset, sendEmail is a no-op and returns false, so callers degrade
// gracefully (the weekly digest still goes out over Telegram). The domain is
// already verified in Resend, so we can send from any @tradershindsight.com.

const FROM =
  process.env.DIGEST_FROM ??
  "The Trader's Hindsight <noreply@tradershindsight.com>";

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
