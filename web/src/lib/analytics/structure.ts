// Price-structure detection for the Foresight technical read. Everything here is
// a fact you can point to on the chart, scored by how it actually behaved.
//
// Primitives detected:
//   - swing highs / lows (fractal pivots)
//   - support / resistance (clustered swings) + double top/bottom (2 equal) +
//     liquidity pools / equal highs-lows (3+ equal, where stops rest)
//   - order blocks (origin candle of an impulsive move)
//   - breaker blocks (an order block price broke through, flipping its polarity)
//   - fair-value gaps (3-candle imbalances)
//
// Each is scored by three behaviours, NOT by touch count:
//   - freshness: untested / unmitigated reacts hardest; the more it is tested the
//     weaker it gets and the more likely it breaks (a liquidity sweep).
//   - rejection: did price actually wick into it and CLOSE back away?
//   - volume: did it form / reject on a tick-volume spike (the FX activity proxy)?
// These fold into a 0..1 `strength`. No imagined "institutional liquidity", just
// observable structure. All pure and offline-tested.

export type SCandle = {
  o: number;
  h: number;
  l: number;
  c: number;
  /** Tick volume (FX activity proxy); optional. */
  v?: number;
};

export type LevelPattern = 'single' | 'double' | 'liquidity';

export type StructLevel = {
  price: number;
  side: 'high' | 'low';
  kind: 'support' | 'resistance';
  /** single = 1 swing, double = 2 equal (double top/bottom), liquidity = 3+. */
  pattern: LevelPattern;
  touches: number;
  barsSinceTouch: number;
  /** Touches that left a clean rejection wick. */
  rejections: number;
  /** Average rel-volume of the touches (1 = average, >1 = spike); 1 if no vol. */
  volSpike: number;
  /** 0..1 composite: rejection quality + freshness + volume. */
  strength: number;
};

export type ZoneSource = 'orderblock' | 'breaker' | 'fvg';

export type StructZone = {
  kind: 'supply' | 'demand';
  source: ZoneSource;
  top: number;
  bottom: number;
  origin: number;
  /** Price has returned into the zone since it formed (spent). */
  mitigated: boolean;
  /** Price wicked into the zone and closed back away (a real reaction). */
  rejected: boolean;
  /** Rel-volume at the formation candle (1 = average). */
  volSpike: number;
  /** 0..1 composite: freshness + rejection + volume. */
  strength: number;
};

export type Structure = { levels: StructLevel[]; zones: StructZone[] };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Average tick volume; null when too few candles carry volume. */
function avgVolume(c: SCandle[]): number | null {
  const vs = c
    .map((x) => x.v)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  if (vs.length < 5) return null;
  return vs.reduce((s, x) => s + x, 0) / vs.length;
}

function relVol(c: SCandle[], idx: number, avg: number | null): number {
  if (avg == null || idx < 0 || idx >= c.length) return 1;
  const v = c[idx].v;
  return typeof v === 'number' && v > 0 ? v / avg : 1;
}

/** 1x volume -> 0, ~2.5x -> 1. */
const volScore = (spike: number) => clamp01((spike - 1) / 1.5);

/** True if any candle after `from` overlaps the [bottom, top] band. */
function touchedAfter(
  c: SCandle[],
  from: number,
  bottom: number,
  top: number,
): boolean {
  for (let k = from + 1; k < c.length; k++) {
    if (c[k].l <= top && c[k].h >= bottom) return true;
  }
  return false;
}

/** True if any candle after `from` tapped the zone and CLOSED back away: for a
 *  supply zone a candle whose high enters it but closes below; for demand a
 *  candle whose low enters it but closes above. That is a real rejection. */
function rejectedAfter(
  c: SCandle[],
  from: number,
  bottom: number,
  top: number,
  kind: 'supply' | 'demand',
): boolean {
  for (let k = from + 1; k < c.length; k++) {
    if (kind === 'supply') {
      if (c[k].h >= bottom && c[k].c < bottom) return true;
    } else if (c[k].l <= top && c[k].c > top) return true;
  }
  return false;
}

function zoneStrength(
  fresh: boolean,
  rejected: boolean,
  spike: number,
): number {
  return clamp01(
    0.3 + (fresh ? 0.3 : 0) + (rejected ? 0.25 : 0) + 0.15 * volScore(spike),
  );
}

// --- Swing levels: S/R, double top/bottom, liquidity pools -------------------

/** Fractal swing highs/lows, clustered with an ATR-relative tolerance, scored by
 *  rejection count + freshness + volume. 1 swing = a single level, 2 equal = a
 *  double top/bottom, 3+ equal = a liquidity pool (resting stops, prone to a
 *  sweep). Only levels with at least one rejection wick are returned. */
export function detectLevels(
  c: SCandle[],
  atr: number,
  w = 2,
): StructLevel[] {
  if (c.length < w * 2 + 2 || atr <= 0) return [];
  const tol = atr * 0.35;
  const wickMin = atr * 0.25;
  const avg = avgVolume(c);

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
    if (isH)
      raws.push({
        price: c[i].h,
        side: 'high',
        idx: i,
        rejected: c[i].h - Math.max(c[i].o, c[i].c) >= wickMin,
      });
    if (isL)
      raws.push({
        price: c[i].l,
        side: 'low',
        idx: i,
        rejected: Math.min(c[i].o, c[i].c) - c[i].l >= wickMin,
      });
  }

  const out: StructLevel[] = [];
  for (const side of ['high', 'low'] as const) {
    const pts = raws
      .filter((r) => r.side === side)
      .sort((a, b) => a.price - b.price);
    let cur: Raw[] = [];
    const flush = () => {
      if (!cur.length) return;
      const touches = cur.length;
      const rejections = cur.filter((r) => r.rejected).length;
      const volSpike =
        cur.reduce((s, r) => s + relVol(c, r.idx, avg), 0) / touches;
      const pattern: LevelPattern =
        touches === 1 ? 'single' : touches === 2 ? 'double' : 'liquidity';
      const freshBonus = touches === 1 ? 0.3 : touches === 2 ? 0.15 : 0;
      out.push({
        price: cur.reduce((s, r) => s + r.price, 0) / touches,
        side,
        kind: side === 'high' ? 'resistance' : 'support',
        pattern,
        touches,
        barsSinceTouch: c.length - 1 - Math.max(...cur.map((r) => r.idx)),
        rejections,
        volSpike,
        strength: clamp01(
          0.25 +
            0.35 * (rejections / touches) +
            0.15 * volScore(volSpike) +
            freshBonus,
        ),
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
  return out.filter((l) => l.rejections > 0);
}

// --- Order blocks + breaker blocks -------------------------------------------

/** Order blocks (origin candle of a >= 1.5 ATR impulse). If price later CLOSES
 *  through the far side, the block is broken and flips polarity into a breaker
 *  block (a failed OB now acting as the opposite side). Freshness, rejection and
 *  volume are measured from the relevant point (after the break for breakers). */
export function detectBlocks(c: SCandle[], atr: number, mult = 1.5): StructZone[] {
  if (c.length < 3 || atr <= 0) return [];
  const avg = avgVolume(c);
  const th = atr * mult;
  const zones: StructZone[] = [];
  for (let i = 1; i < c.length; i++) {
    const body = c[i].c - c[i].o;
    let originIdx = -1;
    let obKind: 'supply' | 'demand' | null = null;
    if (body >= th) {
      let k = i - 1;
      while (k >= 0 && c[k].c >= c[k].o) k--;
      if (k >= 0) {
        originIdx = k;
        obKind = 'demand';
      }
    } else if (-body >= th) {
      let k = i - 1;
      while (k >= 0 && c[k].c <= c[k].o) k--;
      if (k >= 0) {
        originIdx = k;
        obKind = 'supply';
      }
    }
    if (originIdx < 0 || !obKind) continue;
    const top = c[originIdx].h;
    const bottom = c[originIdx].l;

    // Broken if a later candle CLOSES beyond the far side -> flips to a breaker.
    let breakIdx = -1;
    for (let k = i + 1; k < c.length; k++) {
      if (obKind === 'demand' ? c[k].c < bottom : c[k].c > top) {
        breakIdx = k;
        break;
      }
    }
    const broken = breakIdx >= 0;
    const kind: 'supply' | 'demand' = broken
      ? obKind === 'demand'
        ? 'supply'
        : 'demand'
      : obKind;
    const from = broken ? breakIdx : i;
    const mitigated = touchedAfter(c, from, bottom, top);
    const rejected = rejectedAfter(c, from, bottom, top, kind);
    const spike = relVol(c, originIdx, avg);
    zones.push({
      kind,
      source: broken ? 'breaker' : 'orderblock',
      top,
      bottom,
      origin: originIdx,
      mitigated,
      rejected,
      volSpike: spike,
      strength: zoneStrength(!mitigated, rejected, spike),
    });
  }
  return dedupeZones(zones);
}

// --- Fair-value gaps ---------------------------------------------------------

/** Fair-value gaps: a 3-candle imbalance of at least mult x ATR. */
export function detectFvgs(c: SCandle[], atr: number, mult = 0.5): StructZone[] {
  if (c.length < 3 || atr <= 0) return [];
  const avg = avgVolume(c);
  const minGap = atr * mult;
  const zones: StructZone[] = [];
  const push = (
    kind: 'supply' | 'demand',
    bottom: number,
    top: number,
    i: number,
  ) => {
    const mitigated = touchedAfter(c, i + 1, bottom, top);
    const rejected = rejectedAfter(c, i + 1, bottom, top, kind);
    const spike = relVol(c, i, avg);
    zones.push({
      kind,
      source: 'fvg',
      top,
      bottom,
      origin: i,
      mitigated,
      rejected,
      volSpike: spike,
      strength: zoneStrength(!mitigated, rejected, spike),
    });
  };
  for (let i = 1; i < c.length - 1; i++) {
    if (c[i + 1].l - c[i - 1].h >= minGap) push('demand', c[i - 1].h, c[i + 1].l, i);
    else if (c[i - 1].l - c[i + 1].h >= minGap)
      push('supply', c[i + 1].h, c[i - 1].l, i);
  }
  return dedupeZones(zones);
}

/** Drop zones overlapping an already-kept zone of the same kind (keep the most
 *  recent), so we report a handful of distinct zones, not a stack. */
function dedupeZones(zones: StructZone[]): StructZone[] {
  const byRecency = [...zones].sort((a, b) => b.origin - a.origin);
  const kept: StructZone[] = [];
  for (const z of byRecency) {
    if (
      !kept.some(
        (k) => k.kind === z.kind && z.bottom <= k.top && z.top >= k.bottom,
      )
    )
      kept.push(z);
  }
  return kept;
}

/** One call for the whole structure read. */
export function readStructure(c: SCandle[], atr: number): Structure {
  return {
    levels: detectLevels(c, atr),
    zones: [...detectBlocks(c, atr), ...detectFvgs(c, atr)],
  };
}
