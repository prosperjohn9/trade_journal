// The commitment loop. Once a trader commits to a rule (drawn from a Hindsight
// leak), this tracks how they have done against it SINCE committing, and
// estimates the money kept by breaking it less often than they used to. A
// "breach" is defined identically to the leak that produced the rule, so the
// diagnosis and the adherence tracking always agree.

import {
  REVENGE_WINDOW_MS,
  OVERSIZE_FACTOR,
  sessionOf,
  WEEKDAYS,
  median,
  type HindsightTrade,
  type LeakKind,
} from './hindsight';

export type RuleKind = LeakKind;

export type CommitmentRule = {
  kind: RuleKind;
  subject?: string | null; // session name / weekday / emotion tag, for those kinds
  committedAt: string; // ISO
};

export type RuleProgress = {
  trackingDays: number;
  breachesSince: number;
  breachImpactSince: number; // signed net P&L of breach trades since commit (<0 = lost money)
  baselineBreaches: number;
  baselinePerWeek: number;
  currentPerWeek: number;
  estimatedSaved: number; // directional, >= 0
  hasBaseline: boolean;
  hasTrackingData: boolean;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Breach = { at: number; impact: number };

/** Find every trade that breaks the rule, with its signed P&L impact. The impact
 *  mirrors the Hindsight cost model: a revenge or wrong-bucket trade is judged on
 *  its whole net P&L; an oversized trade only on the extra P&L its size added. */
function scanBreaches(
  rule: CommitmentRule,
  trades: HindsightTrade[],
  med: number | null,
): Breach[] {
  const sorted = [...trades].sort((a, b) =>
    a.opened_at < b.opened_at ? -1 : 1,
  );
  const subject = rule.subject?.trim().toLowerCase() ?? null;
  const breaches: Breach[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    let breach = false;
    let impact = 0;

    switch (rule.kind) {
      case 'revenge': {
        if (prev?.outcome === 'LOSS' && prev.closed_at) {
          const gap =
            new Date(t.opened_at).getTime() -
            new Date(prev.closed_at).getTime();
          if (gap >= 0 && gap <= REVENGE_WINDOW_MS) {
            breach = true;
            impact = t.pnl;
          }
        }
        break;
      }
      case 'oversized': {
        const vol = t.volume ?? 0;
        if (prev?.outcome === 'LOSS' && med && vol >= med * OVERSIZE_FACTOR) {
          breach = true;
          impact = t.pnl - t.pnl * (med / vol); // extra P&L from the bigger size
        }
        break;
      }
      case 'session': {
        if (subject && sessionOf(t.opened_at).toLowerCase() === subject) {
          breach = true;
          impact = t.pnl;
        }
        break;
      }
      case 'weekday': {
        if (
          subject &&
          WEEKDAYS[new Date(t.opened_at).getUTCDay()].toLowerCase() === subject
        ) {
          breach = true;
          impact = t.pnl;
        }
        break;
      }
      case 'emotion': {
        if (subject && t.emotion_tag?.trim().toLowerCase() === subject) {
          breach = true;
          impact = t.pnl;
        }
        break;
      }
    }

    if (breach) breaches.push({ at: new Date(t.opened_at).getTime(), impact });
  }
  return breaches;
}

export function computeRuleProgress(
  rule: CommitmentRule,
  trades: HindsightTrade[],
  now: number = Date.now(),
): RuleProgress {
  const med = median(trades.map((t) => t.volume ?? 0).filter((v) => v > 0));
  const breaches = scanBreaches(rule, trades, med);
  const commitMs = new Date(rule.committedAt).getTime();

  const baseline = breaches.filter((b) => b.at < commitMs);
  const tracking = breaches.filter((b) => b.at >= commitMs);

  const earliest = trades.length
    ? Math.min(...trades.map((t) => new Date(t.opened_at).getTime()))
    : commitMs;
  const baselineWeeks = Math.max(WEEK_MS, commitMs - earliest) / WEEK_MS;
  const trackingWeeks = Math.max(WEEK_MS, now - commitMs) / WEEK_MS;

  const baselineImpact = baseline.reduce((s, b) => s + b.impact, 0);
  const trackingImpact = tracking.reduce((s, b) => s + b.impact, 0);

  const baselinePerWeek = baseline.length / baselineWeeks;
  const currentPerWeek = tracking.length / trackingWeeks;

  // Average money a single breach cost historically (only when it was net
  // negative). Used to value the breaches the trader has since avoided.
  const avgLossPerBreach =
    baseline.length > 0 && baselineImpact < 0
      ? -baselineImpact / baseline.length
      : 0;
  const expectedAtOldRate = baselinePerWeek * trackingWeeks;
  const avoided = Math.max(0, expectedAtOldRate - tracking.length);

  // Did any trade close in the tracking window at all? (Used to decide between
  // "tracking from X" and showing real numbers.)
  const hasTrackingData = trades.some(
    (t) => new Date(t.opened_at).getTime() >= commitMs,
  );

  return {
    trackingDays: Math.max(0, Math.round((now - commitMs) / 86_400_000)),
    breachesSince: tracking.length,
    breachImpactSince: trackingImpact,
    baselineBreaches: baseline.length,
    baselinePerWeek,
    currentPerWeek,
    estimatedSaved: avoided * avgLossPerBreach,
    hasBaseline: baseline.length > 0,
    hasTrackingData,
  };
}

/** Default human-readable rule text per kind, used when committing. */
export function ruleStatement(kind: RuleKind, subject?: string | null): string {
  switch (kind) {
    case 'revenge':
      return 'No new trade within one hour of taking a loss.';
    case 'oversized':
      return 'Never size up after a loss; the next trade stays at my normal size.';
    case 'session':
      return `Stop trading the ${subject ?? ''} session.`.replace('  ', ' ');
    case 'weekday':
      return `Take ${subject ?? ''}s off from trading.`.replace('  ', ' ');
    case 'emotion':
      return `Do not trade while feeling "${subject ?? ''}".`;
  }
}
