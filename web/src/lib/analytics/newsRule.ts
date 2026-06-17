// Prop-firm high-impact news rule. Most firms forbid opening (and often
// holding/closing) trades within a window around red-folder news, on pain of a
// voided trade, forfeited profit, or a hard breach. The window minutes come
// from the user or the firm, NEVER assumed here: every decision below is
// computed from the configured minutesBefore/minutesAfter, so we never tell a
// trader they are clear when their own rule says otherwise.

import {
  currenciesForPair,
  type EconomicEvent,
} from '@/src/lib/integrations/forexFactory';

export type NewsPenaltyKind =
  | 'breach'
  | 'void_trade'
  | 'lose_all_profit'
  | 'profit_haircut';

export type NewsPenalty = {
  kind: NewsPenaltyKind;
  /** For 'profit_haircut': percentage of profit forfeited (e.g. 40). */
  haircutPct?: number | null;
};

export type NewsRule = {
  enabled: boolean;
  minutesBefore: number;
  minutesAfter: number;
  penalty: NewsPenalty;
};

export type NewsWindowState = 'clear' | 'approaching' | 'blackout';

export type NewsWindowResult = {
  state: NewsWindowState;
  event: EconomicEvent | null;
  /** Signed seconds to the event; negative once it has passed (cooldown side). */
  secondsToEvent: number | null;
  /** Seconds until the no-go window opens (when approaching). */
  secondsToBlackoutStart: number | null;
  /** Seconds until the no-go window clears (when in blackout). */
  secondsToBlackoutEnd: number | null;
  canOpen: boolean;
  canCloseSafely: boolean;
};

export function penaltyLabel(p: NewsPenalty): string {
  switch (p.kind) {
    case 'breach':
      return 'breach your account';
    case 'void_trade':
      return 'void this trade';
    case 'lose_all_profit':
      return 'wipe your profit';
    case 'profit_haircut':
      return p.haircutPct
        ? `cost you ${p.haircutPct}% of your profit`
        : 'cut your profit';
  }
}

const DEFAULT_HORIZON_MS = 60 * 60_000;

/** Where `now` sits relative to the firm's no-go windows for `pair`, computed
 *  purely from the configured minutes. Pass the High-impact events (e.g. from
 *  fetchHighImpactEvents); this stays pure and offline so it is unit-testable. */
export function evaluateNewsWindow(args: {
  now: number;
  pair: string;
  events: EconomicEvent[];
  rule: NewsRule;
  horizonMs?: number;
}): NewsWindowResult {
  const clear: NewsWindowResult = {
    state: 'clear',
    event: null,
    secondsToEvent: null,
    secondsToBlackoutStart: null,
    secondsToBlackoutEnd: null,
    canOpen: true,
    canCloseSafely: true,
  };
  if (!args.rule.enabled) return clear;

  const ccys = new Set(currenciesForPair(args.pair));
  if (ccys.size === 0) return clear; // unknown symbol: assert nothing

  const before = Math.max(0, args.rule.minutesBefore) * 60_000;
  const after = Math.max(0, args.rule.minutesAfter) * 60_000;
  const horizon = args.horizonMs ?? DEFAULT_HORIZON_MS;
  const now = args.now;

  const windows = args.events
    .filter((e) => ccys.has(e.currency))
    .map((e) => ({ e, start: e.at - before, end: e.at + after }))
    .sort((a, b) => a.start - b.start);

  // Inside a no-go window? Stay restricted until the latest-ending of any
  // overlapping windows clears.
  const active = windows.filter((w) => now >= w.start && now <= w.end);
  if (active.length) {
    const w = active.reduce((m, x) => (x.end > m.end ? x : m), active[0]);
    return {
      state: 'blackout',
      event: w.e,
      secondsToEvent: Math.round((w.e.at - now) / 1000),
      secondsToBlackoutStart: null,
      secondsToBlackoutEnd: Math.max(0, Math.round((w.end - now) / 1000)),
      canOpen: false,
      canCloseSafely: false,
    };
  }

  // Otherwise the next window whose start falls within the look-ahead horizon.
  const next = windows.find((w) => w.start > now && w.start - now <= horizon);
  if (next) {
    return {
      state: 'approaching',
      event: next.e,
      secondsToEvent: Math.round((next.e.at - now) / 1000),
      secondsToBlackoutStart: Math.max(0, Math.round((next.start - now) / 1000)),
      secondsToBlackoutEnd: null,
      canOpen: true,
      canCloseSafely: true,
    };
  }

  return clear;
}

function mins(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m <= 0) return 'under a minute';
  if (m === 1) return '1 minute';
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/** Plain-English heads-up for a window result, worded straight from the rule's
 *  configured minutes. Returns null when there is nothing to flag. */
export function newsWindowMessage(
  r: NewsWindowResult,
  rule: NewsRule,
): string | null {
  if (!r.event || r.state === 'clear') return null;
  const ev = `${r.event.currency} ${r.event.title} (high impact)`;
  const risk = penaltyLabel(rule.penalty);

  if (r.state === 'approaching') {
    const toStart = r.secondsToBlackoutStart ?? 0;
    const toEvent = r.secondsToEvent ?? 0;
    return `${ev} in ${mins(toEvent)}. Your firm blocks trades ${rule.minutesBefore}m before to ${rule.minutesAfter}m after, so the no-go window opens in ${mins(toStart)}. Close or decide before then.`;
  }

  // blackout
  const toEnd = r.secondsToBlackoutEnd ?? 0;
  const toEvent = r.secondsToEvent ?? 0;
  if (toEvent > 0) {
    return `No-go window: ${ev} drops in ${mins(toEvent)}. Opening or closing now risks ${risk}. It clears in ${mins(toEnd)}.`;
  }
  return `${ev} just released. Still in the no-go window for ${mins(toEnd)}; closing now risks ${risk}.`;
}
