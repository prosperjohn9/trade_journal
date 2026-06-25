// Price-structure detection for the Foresight technical read. Everything here is
// a fact you can point to on the chart: fractal swing pivots (with a real
// rejection wick), order blocks (the origin candle of an impulsive move), and
// fair-value gaps (3-candle imbalances). No imagined "institutional liquidity",
// just observable structure.
//
// The governing idea: a level/zone matters because it is FRESH (untested,
// unmitigated), not because it has been hit many times. Each test consumes the
// orders there, so a level tested 3+ times is WEAKER and more likely to break,
// while a fresh level reacts hardest. Detectors expose touch count, recency, and
// mitigation so the signal layer can apply that polarity. All pure, offline-tested.

export type SCandle = { o: number; h: number; l: number; c: number };

export type StructLevel = {
  price: number;
  side: 'high' | 'low';
  /** How many times price tested this cluster (1 = fresh). */
  touches: number;
  /** Bars since the most recent touch (recency). */
  barsSinceTouch: number;
  /** At least one touch left a clean rejection wick (filters noise re-taps). */
  rejected: boolean;
};

export type StructZone = {
  kind: 'supply' | 'demand';
  source: 'orderblock' | 'fvg';
  top: number;
  bottom: number;
  /** Index of the origin candle. */
  origin: number;
  /** Price has traded back into the zone since it formed (spent). */
  mitigated: boolean;
};

/** True if any candle strictly after `fromIdx` overlaps the [bottom, top] band. */
function touchedAfter(
  c: SCandle[],
  fromIdx: number,
  bottom: number,
  top: number,
): boolean {
  for (let k = fromIdx + 1; k < c.length; k++) {
    if (c[k].l <= top && c[k].h >= bottom) return true;
  }
  return false;
}

// --- Swing levels (tightened, rejection-gated) -------------------------------

/** Fractal swing highs/lows, clustered with an ATR-relative tolerance, keeping
 *  touch count, recency, and whether a touch produced a rejection wick. Only
 *  levels with at least one rejection are returned. */
export function detectLevels(
  c: SCandle[],
  atr: number,
  w = 2,
): StructLevel[] {
  if (c.length < w * 2 + 2 || atr <= 0) return [];
  const tol = atr * 0.35; // a real level, not a 5%-of-window smear
  const wickMin = atr * 0.25; // a touch only counts if it rejected by this much

  type Raw = {
    price: number;
    side: 'high' | 'low';
    idx: number;
    rejected: boolean;
  };
  const raws: Raw[] = [];
  for (let i = w; i < c.length - w; i++) {
    let isH = true;
    let isL = true;
    for (let j = i - w; j <= i + w; j++) {
      if (c[j].h > c[i].h) isH = false;
      if (c[j].l < c[i].l) isL = false;
    }
    if (isH) {
      raws.push({
        price: c[i].h,
        side: 'high',
        idx: i,
        rejected: c[i].h - Math.max(c[i].o, c[i].c) >= wickMin, // upper wick
      });
    }
    if (isL) {
      raws.push({
        price: c[i].l,
        side: 'low',
        idx: i,
        rejected: Math.min(c[i].o, c[i].c) - c[i].l >= wickMin, // lower wick
      });
    }
  }

  const out: StructLevel[] = [];
  for (const side of ['high', 'low'] as const) {
    const pts = raws
      .filter((r) => r.side === side)
      .sort((a, b) => a.price - b.price);
    let cur: Raw[] = [];
    const flush = () => {
      if (!cur.length) return;
      out.push({
        price: cur.reduce((s, r) => s + r.price, 0) / cur.length,
        side,
        touches: cur.length,
        barsSinceTouch: c.length - 1 - Math.max(...cur.map((r) => r.idx)),
        rejected: cur.some((r) => r.rejected),
      });
      cur = [];
    };
    for (const r of pts) {
      if (cur.length && Math.abs(r.price - cur[cur.length - 1].price) > tol)
        flush();
      cur.push(r);
    }
    flush();
  }
  return out.filter((l) => l.rejected);
}

// --- Order blocks (impulse origin) -------------------------------------------

/** Order blocks: the origin candle of an impulsive (>= mult x ATR body) move.
 *  Demand = last bearish candle before a bullish impulse; supply = last bullish
 *  candle before a bearish impulse. Marked mitigated once price returns into it. */
export function detectOrderBlocks(
  c: SCandle[],
  atr: number,
  mult = 1.5,
): StructZone[] {
  if (c.length < 3 || atr <= 0) return [];
  const thresh = atr * mult;
  const zones: StructZone[] = [];
  for (let i = 1; i < c.length; i++) {
    const body = c[i].c - c[i].o;
    if (body >= thresh) {
      // bullish impulse -> demand OB = nearest bearish candle before it
      let k = i - 1;
      while (k >= 0 && c[k].c >= c[k].o) k--;
      if (k >= 0)
        zones.push(mkZone('demand', c[k], k, touchedAfter(c, i, c[k].l, c[k].h)));
    } else if (-body >= thresh) {
      // bearish impulse -> supply OB = nearest bullish candle before it
      let k = i - 1;
      while (k >= 0 && c[k].c <= c[k].o) k--;
      if (k >= 0)
        zones.push(mkZone('supply', c[k], k, touchedAfter(c, i, c[k].l, c[k].h)));
    }
  }
  return dedupeZones(zones);
}

function mkZone(
  kind: 'supply' | 'demand',
  candle: SCandle,
  origin: number,
  mitigated: boolean,
): StructZone {
  return {
    kind,
    source: 'orderblock',
    top: candle.h,
    bottom: candle.l,
    origin,
    mitigated,
  };
}

// --- Fair-value gaps (3-candle imbalance) ------------------------------------

/** Fair-value gaps: a 3-candle imbalance of at least mult x ATR. Bullish gap =
 *  demand, bearish gap = supply. Mitigated once a later candle fills it. */
export function detectFvgs(
  c: SCandle[],
  atr: number,
  mult = 0.5,
): StructZone[] {
  if (c.length < 3 || atr <= 0) return [];
  const minGap = atr * mult;
  const zones: StructZone[] = [];
  for (let i = 1; i < c.length - 1; i++) {
    if (c[i + 1].l - c[i - 1].h >= minGap) {
      const bottom = c[i - 1].h;
      const top = c[i + 1].l;
      zones.push({
        kind: 'demand',
        source: 'fvg',
        top,
        bottom,
        origin: i,
        mitigated: touchedAfter(c, i + 1, bottom, top),
      });
    } else if (c[i - 1].l - c[i + 1].h >= minGap) {
      const bottom = c[i + 1].h;
      const top = c[i - 1].l;
      zones.push({
        kind: 'supply',
        source: 'fvg',
        top,
        bottom,
        origin: i,
        mitigated: touchedAfter(c, i + 1, bottom, top),
      });
    }
  }
  return dedupeZones(zones);
}

/** Drop zones that overlap an already-kept zone of the same kind (keep the most
 *  recent origin), so we report a handful of distinct zones, not a stack. */
function dedupeZones(zones: StructZone[]): StructZone[] {
  const byRecency = [...zones].sort((a, b) => b.origin - a.origin);
  const kept: StructZone[] = [];
  for (const z of byRecency) {
    const overlap = kept.some(
      (k) => k.kind === z.kind && z.bottom <= k.top && z.top >= k.bottom,
    );
    if (!overlap) kept.push(z);
  }
  return kept;
}
