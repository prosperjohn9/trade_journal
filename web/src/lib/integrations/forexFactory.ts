// Forex Factory economic calendar, the "red folder" source prop firms write
// their news rules against. There is no official FF API; this consumes the
// weekly JSON feed FF publishes via faireconomy.media (the feed most tools use).
// We only care about High-impact (red folder) events. Best-effort with an
// in-memory cache so a feed blip never hard-blocks a caller.

export type NewsImpact = 'High' | 'Medium' | 'Low' | 'Holiday';

export type EconomicEvent = {
  currency: string; // ISO currency the event moves (USD, GBP, ...)
  title: string;
  at: number; // event time, epoch ms
  impact: NewsImpact;
};

const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const CACHE_TTL_MS = 30 * 60_000;

type RawFfEvent = {
  title?: unknown;
  country?: unknown; // FF stores the currency code here
  date?: unknown; // ISO 8601 with timezone offset
  impact?: unknown; // High | Medium | Low | Holiday
};

function normImpact(v: unknown): NewsImpact | null {
  switch (String(v ?? '').toLowerCase()) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    case 'holiday':
      return 'Holiday';
    default:
      return null;
  }
}

/** Parse the raw FF feed array into typed events. Pure; skips malformed rows. */
export function parseForexFactory(raw: unknown): EconomicEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: EconomicEvent[] = [];
  for (const r of raw as RawFfEvent[]) {
    const impact = normImpact(r.impact);
    const currency = String(r.country ?? '')
      .trim()
      .toUpperCase();
    const at = Date.parse(String(r.date ?? ''));
    const title = String(r.title ?? '').trim();
    if (!impact || !currency || !Number.isFinite(at)) continue;
    out.push({ currency, title, at, impact });
  }
  return out;
}

let cache: { at: number; events: EconomicEvent[] } | null = null;

/** This week's High-impact events. Cached for 30 min; returns the last good
 *  copy (or []) if the feed is unreachable, so news checks never hard-fail. */
export async function fetchHighImpactEvents(
  now: number = Date.now(),
): Promise<EconomicEvent[]> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.events;
  try {
    const res = await fetch(FEED_URL, {
      headers: {
        'user-agent':
          'TradersHindsight/1.0 (+https://tradershindsight.com)',
      },
    });
    if (!res.ok) throw new Error(`FF feed ${res.status}`);
    const json = (await res.json()) as unknown;
    const events = parseForexFactory(json).filter((e) => e.impact === 'High');
    cache = { at: now, events };
    return events;
  } catch {
    return cache?.events ?? [];
  }
}

const FIAT = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD',
  'CNY', 'SGD', 'HKD', 'SEK', 'NOK', 'DKK', 'MXN', 'ZAR', 'TRY', 'PLN',
]);

// Index symbols -> the economy whose news moves them. Covers the common broker
// spellings; anything unmapped just yields no currency (we say nothing rather
// than guess wrong).
const INDEX_CCY: Record<string, string> = {
  US30: 'USD', US500: 'USD', SPX500: 'USD', NAS100: 'USD', US100: 'USD',
  USTEC: 'USD', US2000: 'USD',
  GER40: 'EUR', DE40: 'EUR', GER30: 'EUR', DE30: 'EUR', EU50: 'EUR',
  STOXX50: 'EUR',
  UK100: 'GBP', FTSE100: 'GBP',
  JPN225: 'JPY', JP225: 'JPY', NIK225: 'JPY',
  AUS200: 'AUD',
};

/** Currencies whose high-impact news can move this symbol. FX pairs -> both
 *  legs; metals -> the quote fiat; indices -> their home economy; unknown ->
 *  [] (better to assess nothing than assert a wrong currency). */
export function currenciesForPair(symbol: string): string[] {
  const core = String(symbol ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!core) return [];
  if (INDEX_CCY[core]) return [INDEX_CCY[core]];

  const letters = core.replace(/[^A-Z]/g, '');
  if (letters.length >= 6) {
    const a = letters.slice(0, 3);
    const b = letters.slice(3, 6);
    // Metals (XAU/XAG/XPT/XPD): only the quote fiat carries a news calendar.
    if (['XAU', 'XAG', 'XPT', 'XPD'].includes(a) && FIAT.has(b)) return [b];
    const out: string[] = [];
    if (FIAT.has(a)) out.push(a);
    if (FIAT.has(b) && b !== a) out.push(b);
    if (out.length) return out;
  }
  const lead = letters.slice(0, 3);
  return FIAT.has(lead) ? [lead] : [];
}
