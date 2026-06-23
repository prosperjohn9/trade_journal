import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';
import { adminUserIdSet } from '@/src/lib/auth/admin';
import {
  fetchHighImpactEvents,
  currenciesForPair,
} from '@/src/lib/integrations/forexFactory';
import { buildNewsBriefing } from '@/src/lib/analytics/newsBriefing';
import { sendTelegram } from '@/src/lib/integrations/telegram';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/cron/news-briefing
//
// Daily (06:30 UTC via pg_cron). For each entitled user with Telegram linked who
// hasn't opted out, pushes today's high-impact Forex Factory events for the
// currencies they actually trade, in their local time. Silent on a clear day.
// Auth: CRON_SECRET.

const MAX_PER_RUN = 300;
const ACTIVE_DAYS = 60; // pairs traded within this window define "their pairs"

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h =
    request.headers.get('authorization') ?? request.headers.get('x-cron-secret');
  return h === secret || h === `Bearer ${secret}`;
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
    .select(
      'id, telegram_chat_id, timezone, news_briefing_enabled, news_briefing_currencies',
    )
    .in('id', [...entitled]);
  const eligible = ((profs ?? []) as Array<{
    id: string;
    telegram_chat_id: string | null;
    timezone: string | null;
    news_briefing_enabled: boolean | null;
    news_briefing_currencies: string[] | null;
  }>).filter((p) => p.telegram_chat_id && p.news_briefing_enabled !== false);
  if (!eligible.length) return NextResponse.json({ processed: 0, sent: 0 });

  const events = await fetchHighImpactEvents();
  if (!events.length) {
    return NextResponse.json({ processed: 0, sent: 0, note: 'calendar feed empty' });
  }

  const since = new Date(Date.now() - ACTIVE_DAYS * 86_400_000).toISOString();
  let processed = 0;
  let sent = 0;

  for (const p of eligible) {
    if (processed >= MAX_PER_RUN) break;
    processed++;

    // The user's explicit currency choice wins; otherwise infer from the pairs
    // they've actually traded in the last 60 days.
    let ccys: Set<string>;
    if (p.news_briefing_currencies && p.news_briefing_currencies.length) {
      ccys = new Set(p.news_briefing_currencies.map((c) => c.toUpperCase()));
    } else {
      const { data: rows } = await admin
        .from('trades')
        .select('instrument')
        .eq('user_id', p.id)
        .gte('opened_at', since);
      ccys = new Set<string>();
      for (const r of (rows ?? []) as Array<{ instrument: string | null }>) {
        for (const c of currenciesForPair(String(r.instrument ?? ''))) ccys.add(c);
      }
    }
    if (!ccys.size) continue;

    const text = buildNewsBriefing({
      events,
      currencies: ccys,
      timezone: p.timezone ?? 'UTC',
    });
    if (!text) continue;

    try {
      await sendTelegram(p.telegram_chat_id as string, text);
      sent++;
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ processed, sent });
}
