import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';
import { adminUserIdSet } from '@/src/lib/auth/admin';
import { buildWeeklyDigest } from '@/src/lib/analytics/digest';
import type { HindsightTrade } from '@/src/lib/analytics/hindsight';
import {
  buildPnlNormalizer,
  type PnlNormalizer,
} from '@/src/lib/analytics/normalizePnl';
import { sendTelegram } from '@/src/lib/integrations/telegram';
import { isEmailConfigured, sendEmail } from '@/src/lib/integrations/email';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/cron/digest
//
// Weekly Hindsight digest (Mondays via pg_cron). For each entitled user who has
// not opted out and traded in the last 7 days, computes their week's behavioural
// leaks (same engine as the in-app Hindsight Report) and delivers it to Telegram
// (if linked) and email (if RESEND_API_KEY is set). Auth: CRON_SECRET.

const APP_ORIGIN = 'https://tradershindsight.com';
const TRADE_SELECT =
  'account_id, opened_at, closed_at, outcome, pnl_amount, net_pnl, commission, volume, emotion_tag';
const MAX_PER_RUN = 200;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h =
    request.headers.get('authorization') ?? request.headers.get('x-cron-secret');
  return h === secret || h === `Bearer ${secret}`;
}

type Row = {
  account_id: string | null;
  opened_at: string;
  closed_at: string | null;
  outcome: string | null;
  pnl_amount: number | null;
  net_pnl: number | null;
  commission: number | null;
  volume: number | null;
  emotion_tag: string | null;
};

function toTrade(r: Row, fx: PnlNormalizer): HindsightTrade {
  const raw =
    r.net_pnl != null
      ? Number(r.net_pnl)
      : Number(r.pnl_amount ?? 0) - Number(r.commission ?? 0);
  const pnl = fx.toDisplay(Number.isFinite(raw) ? raw : 0, r.account_id);
  return {
    opened_at: r.opened_at,
    closed_at: r.closed_at,
    outcome: r.outcome,
    pnl: Number.isFinite(pnl) ? pnl : 0,
    volume: r.volume,
    emotion_tag: r.emotion_tag,
  };
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // Entitled users + admins.
  const { data: subs } = await admin
    .from('subscriptions')
    .select(`user_id, ${SUBSCRIPTION_SELECT}`);
  const entitled = new Set<string>(await adminUserIdSet(admin));
  for (const s of (subs ?? []) as Array<SubscriptionRow & { user_id: string }>) {
    if (resolveEntitlements(s).entitled) entitled.add(s.user_id);
  }
  if (!entitled.size) return NextResponse.json({ processed: 0, sent: 0 });

  const { data: profs } = await admin
    .from('profiles')
    .select('id, base_currency, timezone, telegram_chat_id, weekly_digest_enabled')
    .in('id', [...entitled]);

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const emailOn = isEmailConfigured();
  let processed = 0;
  let sent = 0;

  for (const p of (profs ?? []) as Array<{
    id: string;
    base_currency: string | null;
    timezone: string | null;
    telegram_chat_id: string | null;
    weekly_digest_enabled: boolean | null;
  }>) {
    if (p.weekly_digest_enabled === false) continue;
    if (!p.telegram_chat_id && !emailOn) continue; // no delivery channel
    if (processed >= MAX_PER_RUN) break;
    processed++;

    const { data: rows } = await admin
      .from('trades')
      .select(TRADE_SELECT)
      .eq('user_id', p.id)
      .gte('closed_at', since);
    if (!rows || !rows.length) continue;

    const fx = await buildPnlNormalizer(admin, p.id, p.base_currency ?? 'USD');
    const digest = buildWeeklyDigest(
      (rows as Row[]).map((r) => toTrade(r, fx)),
      {
        currency: p.base_currency ?? 'USD',
        appUrl: APP_ORIGIN,
        timezone: p.timezone ?? 'UTC',
      },
    );
    if (!digest.hasContent) continue;

    let delivered = false;
    if (p.telegram_chat_id) {
      try {
        await sendTelegram(p.telegram_chat_id, digest.telegram);
        delivered = true;
      } catch {
        // best-effort
      }
    }
    if (emailOn) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(p.id);
        const email = u.user?.email;
        if (email) {
          const ok = await sendEmail({
            to: email,
            subject: digest.subject,
            html: digest.emailHtml,
          });
          delivered = delivered || ok;
        }
      } catch {
        // best-effort
      }
    }
    if (delivered) sent++;
  }

  return NextResponse.json({ processed, sent });
}
