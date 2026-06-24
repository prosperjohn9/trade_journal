// Auto-tagging: label every trade automatically from the trade itself (session,
// instrument class) and its sequence (Revenge / Oversized / Tilt). The behavioural
// tags reuse the EXACT Hindsight definitions, so a trade tagged "Revenge" here is
// the same trade the leak report counts. Pure computation, no storage.

import {
  sessionOf,
  median,
  REVENGE_WINDOW_MS,
  OVERSIZE_FACTOR,
  dayKey,
} from './hindsight';

export type AutoTagKind = 'session' | 'class' | 'behavior';
export type AutoTag = { label: string; kind: AutoTagKind };

export type AutoTagTrade = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  outcome: string | null;
  instrument: string | null;
  volume: number | null;
};

/** Best-effort asset class from the symbol (FX/CFD focused). Null when unknown. */
export function instrumentClass(symbol: string | null): string | null {
  const s = (symbol ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return null;
  if (/XAU|XAG|GOLD|SILVER|XPT|XPD/.test(s)) return 'Metal';
  if (/WTI|BRENT|USOIL|UKOIL|NGAS|XTI|XBR/.test(s)) return 'Energy';
  if (/BTC|ETH|SOL|XRP|DOGE|LTC|BNB|ADA/.test(s)) return 'Crypto';
  if (
    /US30|US100|US500|NAS|NDX|SPX|DJI|GER|DAX|UK100|FTSE|JP225|HK50|AUS200|US2000/.test(
      s,
    )
  )
    return 'Index';
  if (/^[A-Z]{6}$/.test(s)) return 'Forex';
  return null;
}

function medianByInstrument(trades: AutoTagTrade[]): Map<string, number> {
  const by = new Map<string, number[]>();
  for (const t of trades) {
    const inst = (t.instrument ?? '').toUpperCase();
    const v = t.volume ?? 0;
    if (!inst || v <= 0) continue;
    const arr = by.get(inst) ?? [];
    arr.push(v);
    by.set(inst, arr);
  }
  const out = new Map<string, number>();
  for (const [inst, vs] of by) {
    if (vs.length < 4) continue;
    const m = median(vs);
    if (m && m > 0) out.set(inst, m);
  }
  return out;
}

/** Auto-tags per trade id, computed over the full (chronological) list so the
 *  behavioural tags see each trade's context. */
export function autoTagsForTrades(
  trades: AutoTagTrade[],
  tz = 'UTC',
): Map<string, AutoTag[]> {
  const sorted = [...trades].sort((a, b) =>
    a.opened_at < b.opened_at ? -1 : 1,
  );
  const med = medianByInstrument(trades);
  const out = new Map<string, AutoTag[]>();
  let lossRun = 0;
  let prevDay: string | null = null;

  for (let k = 0; k < sorted.length; k++) {
    const t = sorted[k];
    const prev = k > 0 ? sorted[k - 1] : null;
    const day = dayKey(t.opened_at, tz);
    if (prevDay !== null && day !== prevDay) lossRun = 0; // streak resets daily

    const tags: AutoTag[] = [
      { label: `${sessionOf(t.opened_at)} session`, kind: 'session' },
    ];
    const cls = instrumentClass(t.instrument);
    if (cls) tags.push({ label: cls, kind: 'class' });

    // Revenge: opened within an hour of the prior trade closing at a loss.
    if (prev?.outcome === 'LOSS' && prev.closed_at) {
      const gap =
        new Date(t.opened_at).getTime() - new Date(prev.closed_at).getTime();
      if (gap >= 0 && gap <= REVENGE_WINDOW_MS)
        tags.push({ label: 'Revenge', kind: 'behavior' });
    }
    // Oversized: after a loss, >= 1.5x your usual size on THAT instrument.
    const m = med.get((t.instrument ?? '').toUpperCase());
    if (prev?.outcome === 'LOSS' && m && (t.volume ?? 0) >= m * OVERSIZE_FACTOR)
      tags.push({ label: 'Oversized', kind: 'behavior' });
    // Tilt: opened while already on a 2+ loss run that same day.
    if (lossRun >= 2) tags.push({ label: 'Tilt', kind: 'behavior' });

    out.set(t.id, tags);

    if (t.outcome === 'LOSS') lossRun += 1;
    else if (t.outcome === 'WIN') lossRun = 0;
    prevDay = day;
  }
  return out;
}
