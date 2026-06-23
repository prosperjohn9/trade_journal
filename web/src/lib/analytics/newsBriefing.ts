// Daily Telegram news briefing: today's high-impact (red-folder) Forex Factory
// events for the currencies the trader actually trades, in their local time.
// Pure formatting; the cron supplies the events + the user's pairs.

import type { EconomicEvent } from '@/src/lib/integrations/forexFactory';

function localDateKey(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  }
}

function localTime(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms));
  }
}

/** Briefing text for the rest of today's high-impact events on the user's pairs,
 *  or null when the calendar is clear for them (so we stay silent, not noisy). */
export function buildNewsBriefing(input: {
  events: EconomicEvent[];
  currencies: Set<string>;
  timezone: string;
  now?: number;
}): string | null {
  const now = input.now ?? Date.now();
  const tz = input.timezone || 'UTC';
  const todayKey = localDateKey(now, tz);

  const todays = input.events
    .filter(
      (e) =>
        input.currencies.has(e.currency) &&
        e.at >= now &&
        localDateKey(e.at, tz) === todayKey,
    )
    .sort((a, b) => a.at - b.at);
  if (!todays.length) return null;

  const lines = todays.map(
    (e) => `${localTime(e.at, tz)}  ${e.currency}  ${e.title}`,
  );
  return `Today's high-impact news for your pairs (your local time):\n\n${lines.join('\n')}\n\nTrade around these, and mind your prop news rule.`;
}
