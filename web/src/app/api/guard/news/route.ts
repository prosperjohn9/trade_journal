import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  fetchHighImpactEvents,
  currenciesForPair,
} from '@/src/lib/integrations/forexFactory';
import { sendTelegram } from '@/src/lib/integrations/telegram';

export const runtime = 'nodejs';

// POST /api/guard/news  (worker-only)
//
// In-trade news countdown. The worker reports the symbols currently open on a
// guarded account; we find the nearest high-impact (red-folder) event for each
// pair's currencies and, when one is close, ping the owner's Telegram. Deduped
// via foresight_news_alerts so each (pair, event, band) fires at most once.
//
// No AI spend: these are deterministic calendar alerts, not reads.

const HEADSUP_MIN = 45; // ping once when within this many minutes
const IMMINENT_MIN = 15; // upgrade to "soon" within this many minutes

function bandFor(minutes: number): 'imminent' | 'headsup' | null {
  if (minutes <= 0) return null;
  if (minutes <= IMMINENT_MIN) return 'imminent';
  if (minutes <= HEADSUP_MIN) return 'headsup';
  return null;
}

type NewsRule = {
  enabled?: boolean;
  minutesBefore?: number;
  minutesAfter?: number;
};

export async function POST(request: Request) {
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret || request.headers.get('x-worker-secret') !== workerSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    connectionId?: unknown;
    symbols?: unknown;
  };
  const connectionId =
    typeof body.connectionId === 'string' ? body.connectionId : null;
  const symbols = Array.isArray(body.symbols)
    ? [...new Set(body.symbols.filter((s): s is string => typeof s === 'string'))]
    : [];
  if (!connectionId || symbols.length === 0) {
    return NextResponse.json({ ok: true, delivered: 0 });
  }

  const sb = createServiceClient();
  const { data: conn } = await sb
    .from('mt_connections')
    .select('account_id, user_id')
    .eq('id', connectionId)
    .maybeSingle();
  const c = conn as { account_id: string; user_id: string } | null;
  if (!c) return NextResponse.json({ ok: true, delivered: 0 });

  // Need a linked Telegram to deliver; otherwise there is nothing to do.
  const { data: prof } = await sb
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', c.user_id)
    .maybeSingle();
  const chatId = (prof as { telegram_chat_id?: string | null } | null)
    ?.telegram_chat_id;
  if (!chatId) return NextResponse.json({ ok: true, delivered: 0 });

  const events = await fetchHighImpactEvents();
  if (!events.length) return NextResponse.json({ ok: true, delivered: 0 });

  // Optional firm blackout window, to spell out in the ping.
  const { data: acct } = await sb
    .from('accounts')
    .select('prop_rules')
    .eq('id', c.account_id)
    .maybeSingle();
  const rule = ((acct as { prop_rules?: { news?: NewsRule } } | null)?.prop_rules
    ?.news ?? null) as NewsRule | null;
  const blackout =
    rule?.enabled && (rule.minutesBefore != null || rule.minutesAfter != null)
      ? ` Your firm blacks out ${rule.minutesBefore ?? 0} min before to ${rule.minutesAfter ?? 0} min after.`
      : '';

  const now = Date.now();
  let delivered = 0;

  for (const symbol of symbols) {
    const currencies = currenciesForPair(symbol);
    if (!currencies.length) continue;
    const next = events
      .filter((e) => currencies.includes(e.currency) && e.at > now)
      .sort((a, b) => a.at - b.at)[0];
    if (!next) continue;

    const minutes = Math.round((next.at - now) / 60_000);
    const band = bandFor(minutes);
    if (!band) continue;

    // Dedupe: insert wins only the first time for this (user, pair, event, band).
    const { data: ins } = await sb
      .from('foresight_news_alerts')
      .upsert(
        {
          user_id: c.user_id,
          symbol,
          event_at: new Date(next.at).toISOString(),
          band,
        },
        { onConflict: 'user_id,symbol,event_at,band', ignoreDuplicates: true },
      )
      .select('id');
    if (!ins || ins.length === 0) continue; // already pinged this band

    const lead =
      band === 'imminent'
        ? `Soon: high-impact ${next.currency} news in ${minutes} min`
        : `Heads up: high-impact ${next.currency} news in ${minutes} min`;
    await sendTelegram(
      chatId,
      `${lead} (${next.title}). Your open ${symbol} trade is exposed.${blackout}`,
    );
    delivered += 1;
  }

  return NextResponse.json({ ok: true, delivered });
}
