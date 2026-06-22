// Which timeframes Foresight reads for a trade. The trader optionally tells us
// the timeframe they ANALYZED on; we read that plus a higher-timeframe context
// (never the execution timeframe, never above daily). With nothing given we
// assume a day trader and read the 1H + 4H.

export type Tf = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export const TF_VALUES: Tf[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

export function isTf(v: unknown): v is Tf {
  return typeof v === 'string' && (TF_VALUES as string[]).includes(v);
}

// MetaApi timeframe code + a human label per timeframe.
const META: Record<Tf, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '4h': '4h', '1d': '1d',
};
const LABEL: Record<Tf, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1H', '4h': '4H', '1d': 'Daily',
};

// Analyzed timeframe -> the higher timeframe(s) to add for context.
const HIGHER: Record<Tf, Tf[]> = {
  '1m': ['30m'],
  '5m': ['1h'],
  '15m': ['4h'],
  '30m': ['4h', '1d'],
  '1h': ['4h', '1d'],
  '4h': ['1d'],
  '1d': [],
};

export type AnalysisTf = { tf: string; code: string };

/** The timeframes to read for a trade. `analyzed` null => day-trader default. */
export function analysisTimeframes(analyzed?: Tf | null): AnalysisTf[] {
  const chain: Tf[] = analyzed ? [analyzed, ...HIGHER[analyzed]] : ['1h', '4h'];
  const seen = new Set<Tf>();
  const out: AnalysisTf[] = [];
  for (const t of chain) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push({ tf: LABEL[t], code: META[t] });
  }
  return out;
}

export function tfLabel(t: Tf): string {
  return LABEL[t];
}

// cTrader Open API ProtoOATrendbarPeriod ids per timeframe.
const CTRADER_PERIOD: Record<Tf, number> = {
  '1m': 1, '5m': 5, '15m': 7, '30m': 8, '1h': 9, '4h': 10, '1d': 12,
};

export type CtraderTf = { label: string; period: number };

/** Same chain as analysisTimeframes, but as cTrader trendbar periods, so the
 *  worker fetches the trader's real timeframes over the Open API socket. */
export function ctraderTimeframes(analyzed?: Tf | null): CtraderTf[] {
  const chain: Tf[] = analyzed ? [analyzed, ...HIGHER[analyzed]] : ['1h', '4h'];
  const seen = new Set<Tf>();
  const out: CtraderTf[] = [];
  for (const t of chain) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push({ label: LABEL[t], period: CTRADER_PERIOD[t] });
  }
  return out;
}
