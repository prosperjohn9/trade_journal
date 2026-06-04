// Behavioural analytics — the signals behind the AI "leak detector". Pure and
// server-usable (no client deps), computed across the trader's whole history.
// These surface patterns aggregate stats hide: session/weekday decay, tilt after
// losses, the disposition effect (holding losers longer), and sizing leaks.

export type BehaviorTrade = {
  opened_at: string;
  closed_at: string | null;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' | null;
  pnl: number;
  volume: number | null;
  emotion_tag: string | null;
};

type Session = 'ASIA' | 'LONDON' | 'OVERLAP' | 'NEW_YORK';

/** Forex session from UTC hour (mirrors getSessionUTC in useAnalytics). */
function sessionUTC(iso: string): Session {
  const h = new Date(iso).getUTCHours();
  if (h >= 21 || h <= 6) return 'ASIA';
  if (h >= 7 && h <= 11) return 'LONDON';
  if (h >= 12 && h <= 15) return 'OVERLAP';
  return 'NEW_YORK';
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type GroupStat = {
  key: string;
  count: number;
  winRate: number;
  netPnl: number;
  avgPnl: number;
};

type SeqStat = { count: number; winRate: number; avgPnl: number };

export type BehaviorSignals = {
  totalTrades: number;
  bySession: GroupStat[];
  byDayOfWeek: GroupStat[];
  byEmotion: GroupStat[];
  sequence: {
    overallWinRate: number;
    afterLoss: SeqStat;
    afterWin: SeqStat;
    afterTwoLosses: SeqStat;
    maxConsecutiveLosses: number;
  };
  holdTime: {
    avgWinnerMin: number | null;
    avgLoserMin: number | null;
    ratioLoserOverWinner: number | null;
  };
  size: {
    avgWinnerVolume: number | null;
    avgLoserVolume: number | null;
    avgVolumeAfterLoss: number | null;
    avgVolumeOverall: number | null;
  };
};

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function durationMin(t: BehaviorTrade): number | null {
  if (!t.closed_at) return null;
  const ms = new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms / 60000 : null;
}

function group(
  trades: BehaviorTrade[],
  keyOf: (t: BehaviorTrade) => string | null,
): GroupStat[] {
  const map = new Map<string, { count: number; wins: number; net: number }>();
  for (const t of trades) {
    const key = keyOf(t);
    if (!key) continue;
    const cur = map.get(key) ?? { count: 0, wins: 0, net: 0 };
    cur.count += 1;
    if (t.outcome === 'WIN') cur.wins += 1;
    cur.net += t.pnl;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      count: v.count,
      winRate: v.count ? (v.wins / v.count) * 100 : 0,
      netPnl: v.net,
      avgPnl: v.count ? v.net / v.count : 0,
    }))
    .sort((a, b) => a.netPnl - b.netPnl);
}

function seqStat(arr: BehaviorTrade[]): SeqStat {
  return {
    count: arr.length,
    winRate: arr.length
      ? (arr.filter((t) => t.outcome === 'WIN').length / arr.length) * 100
      : 0,
    avgPnl: avg(arr.map((t) => t.pnl)) ?? 0,
  };
}

const vol = (t: BehaviorTrade): number | null =>
  typeof t.volume === 'number' && Number.isFinite(t.volume) ? t.volume : null;
const isNum = (n: number | null): n is number => n != null;

export function computeBehaviorSignals(
  trades: BehaviorTrade[],
): BehaviorSignals {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime(),
  );

  const bySession = group(sorted, (t) => sessionUTC(t.opened_at));
  const byDayOfWeek = group(sorted, (t) => DOW[new Date(t.opened_at).getUTCDay()]);
  const byEmotion = group(sorted, (t) =>
    t.emotion_tag && t.emotion_tag.trim() ? t.emotion_tag.trim() : null,
  );

  const wins = sorted.filter((t) => t.outcome === 'WIN').length;
  const overallWinRate = sorted.length ? (wins / sorted.length) * 100 : 0;

  const afterLoss: BehaviorTrade[] = [];
  const afterWin: BehaviorTrade[] = [];
  const afterTwoLosses: BehaviorTrade[] = [];
  let consec = 0;
  let maxConsecutiveLosses = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1].outcome;
      if (prev === 'LOSS') afterLoss.push(sorted[i]);
      if (prev === 'WIN') afterWin.push(sorted[i]);
      if (
        i > 1 &&
        sorted[i - 1].outcome === 'LOSS' &&
        sorted[i - 2].outcome === 'LOSS'
      ) {
        afterTwoLosses.push(sorted[i]);
      }
    }
    if (sorted[i].outcome === 'LOSS') {
      consec += 1;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consec);
    } else {
      consec = 0;
    }
  }

  const winnerDurations = sorted
    .filter((t) => t.outcome === 'WIN')
    .map(durationMin)
    .filter(isNum);
  const loserDurations = sorted
    .filter((t) => t.outcome === 'LOSS')
    .map(durationMin)
    .filter(isNum);
  const avgWinnerMin = avg(winnerDurations);
  const avgLoserMin = avg(loserDurations);

  const winnerVols = sorted
    .filter((t) => t.outcome === 'WIN')
    .map(vol)
    .filter(isNum);
  const loserVols = sorted
    .filter((t) => t.outcome === 'LOSS')
    .map(vol)
    .filter(isNum);

  return {
    totalTrades: sorted.length,
    bySession,
    byDayOfWeek,
    byEmotion,
    sequence: {
      overallWinRate,
      afterLoss: seqStat(afterLoss),
      afterWin: seqStat(afterWin),
      afterTwoLosses: seqStat(afterTwoLosses),
      maxConsecutiveLosses,
    },
    holdTime: {
      avgWinnerMin,
      avgLoserMin,
      ratioLoserOverWinner:
        avgWinnerMin && avgWinnerMin > 0 && avgLoserMin != null
          ? avgLoserMin / avgWinnerMin
          : null,
    },
    size: {
      avgWinnerVolume: avg(winnerVols),
      avgLoserVolume: avg(loserVols),
      avgVolumeAfterLoss: avg(afterLoss.map(vol).filter(isNum)),
      avgVolumeOverall: avg(sorted.map(vol).filter(isNum)),
    },
  };
}
