// Market-structure swing detection: the swing highs and lows traders actually
// respect, not every 5-candle fractal. A swing is SIGNIFICANT when the leg it
// anchored is a real move (>= SIG_ATR x ATR), and structure is read as the
// alternating zigzag of those swings with break-of-structure labels (HH/HL =
// bullish continuation/pullback, LL/LH = bearish / shift). The current "range"
// is the most recent significant swing high and swing low, and a trade's
// invalidation is the structural swing behind its entry. Pure, offline-tested.

import type { SCandle } from './structure';

export type SwingKind = 'high' | 'low';

export type Swing = {
  index: number;
  price: number;
  kind: SwingKind;
  /** Size of the leg into this swing (from the prior opposite swing), in ATR. */
  legAtr: number;
  /** A real structural turn, not noise. */
  significant: boolean;
  /** Versus the prior same-kind swing: higher-high, higher-low, lower-low,
   *  lower-high. The shift (LL after HHs, or HH after LLs) is the structure break. */
  bos: 'HH' | 'HL' | 'LL' | 'LH' | null;
};

export type Structure = {
  swings: Swing[];
  rangeHigh: Swing | null;
  rangeLow: Swing | null;
  bias: 'bullish' | 'bearish' | 'ranging';
};

/** A swing's leg must clear BOTH gates to be significant: an absolute ATR floor
 *  (a real move), and a fraction of the dominant leg on the chart (so a minor
 *  bounce does not pass just because ATR is locally suppressed after a big move). */
export const SIG_ATR = 1.5;
export const SIG_RANGE_FRAC = 0.3;

/** Time-ordered fractal pivots: a strict local high/low over a w-each-side window. */
function fractals(
  c: SCandle[],
  w = 2,
): { index: number; price: number; kind: SwingKind }[] {
  const out: { index: number; price: number; kind: SwingKind }[] = [];
  for (let i = w; i < c.length - w; i++) {
    let isH = true;
    let isL = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (c[j].h >= c[i].h) isH = false;
      if (c[j].l <= c[i].l) isL = false;
    }
    if (isH) out.push({ index: i, price: c[i].h, kind: 'high' });
    if (isL) out.push({ index: i, price: c[i].l, kind: 'low' });
  }
  return out.sort((a, b) => a.index - b.index);
}

export function marketStructure(c: SCandle[], atr: number): Structure {
  const empty: Structure = {
    swings: [],
    rangeHigh: null,
    rangeLow: null,
    bias: 'ranging',
  };
  if (c.length < 6 || atr <= 0) return empty;

  // Alternating zigzag: collapse same-kind runs to the more extreme pivot, so we
  // get a clean high, low, high, low... sequence of turning points.
  const zig: { index: number; price: number; kind: SwingKind }[] = [];
  for (const p of fractals(c)) {
    const last = zig[zig.length - 1];
    if (!last || last.kind !== p.kind) zig.push({ ...p });
    else if (
      (p.kind === 'high' && p.price > last.price) ||
      (p.kind === 'low' && p.price < last.price)
    )
      zig[zig.length - 1] = { ...p };
  }

  const swings: Swing[] = zig.map((p, i) => {
    // A swing matters if it anchored a real move INTO or OUT of it, so use the
    // larger leg (the first/last swing then still counts off its one real leg).
    const legIn = i > 0 ? Math.abs(p.price - zig[i - 1].price) / atr : 0;
    const legOut =
      i < zig.length - 1 ? Math.abs(zig[i + 1].price - p.price) / atr : 0;
    const prior = i >= 2 ? zig[i - 2] : null; // prior same-kind swing
    let bos: Swing['bos'] = null;
    if (prior) {
      if (p.kind === 'high') bos = p.price > prior.price ? 'HH' : 'LH';
      else bos = p.price < prior.price ? 'LL' : 'HL';
    }
    return {
      index: p.index,
      price: p.price,
      kind: p.kind,
      legAtr: Math.max(legIn, legOut),
      significant: false, // set below, once the dominant leg is known
      bos,
    };
  });

  // Relative gate: a swing is significant only if its leg clears the ATR floor
  // AND is a meaningful fraction of the largest leg on the chart.
  const maxLeg = swings.reduce((m, s) => Math.max(m, s.legAtr), 0);
  for (const s of swings)
    s.significant =
      s.legAtr >= SIG_ATR && s.legAtr >= SIG_RANGE_FRAC * maxLeg;

  const sig = swings.filter((s) => s.significant);
  const rangeHigh =
    [...sig].reverse().find((s) => s.kind === 'high') ?? null;
  const rangeLow = [...sig].reverse().find((s) => s.kind === 'low') ?? null;

  // Bias from the most recent significant structure labels.
  const recent = sig.slice(-4).map((s) => s.bos);
  const bullish = recent.filter((b) => b === 'HH' || b === 'HL').length;
  const bearish = recent.filter((b) => b === 'LL' || b === 'LH').length;
  const bias =
    bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'ranging';

  return { swings, rangeHigh, rangeLow, bias };
}

/** The structural level a trade's idea depends on: the nearest significant swing
 *  low below a long's entry (or swing high above a short's). Break it and the
 *  premise is gone, so the stop belongs just beyond it. */
export function invalidationSwing(
  s: Structure,
  side: 'BUY' | 'SELL',
  entry: number,
): Swing | null {
  const sig = s.swings.filter((x) => x.significant);
  if (side === 'BUY') {
    const lows = sig.filter((x) => x.kind === 'low' && x.price < entry);
    return lows.length
      ? lows.reduce((a, b) => (b.price > a.price ? b : a))
      : null; // highest significant low below entry
  }
  const highs = sig.filter((x) => x.kind === 'high' && x.price > entry);
  return highs.length
    ? highs.reduce((a, b) => (b.price < a.price ? b : a))
    : null; // lowest significant high above entry
}

/** Plain label for a structure bias / break. */
export function biasLabel(b: Structure['bias']): string {
  return b === 'bullish'
    ? 'higher highs and higher lows'
    : b === 'bearish'
      ? 'lower lows and lower highs'
      : 'no clear structure (ranging)';
}
