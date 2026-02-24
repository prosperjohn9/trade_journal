'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErr } from '@/src/domain/errors';
import type { Profile } from '@/src/domain/profile';
import { toNumberSafe } from '@/src/lib/utils/number';
import {
  loadAnalyticsBootstrap,
  loadAnalyticsTradesInRange,
  logoutAnalytics,
  type AnalyticsSetupTemplate,
  type AnalyticsTrade,
} from '@/src/lib/services/analytics.service';

export type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
export type Direction = 'BUY' | 'SELL';
export type Session = 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP';

export type Filters = {
  rangeStart: string;
  rangeEnd: string;
  instrumentQuery: string;
  directionFilter: '' | Direction;
  sessionFilter: '' | Session;
  outcomeFilter: '' | Outcome;
  reviewedFilter: '' | 'REVIEWED' | 'NOT_REVIEWED';
  setupFilter: '' | 'NO_SETUP' | string;
};

type LinePoint = {
  xLabel: string;
  y: number;
  meta?: {
    dayNet?: number;
    cumNet?: number;
  };
};

export function getSessionUTC(iso: string): Session {
  const h = new Date(iso).getUTCHours();

  if (h >= 21 || h <= 6) return 'ASIA';
  if (h >= 7 && h <= 11) return 'LONDON';
  if (h >= 12 && h <= 15) return 'OVERLAP';
  return 'NEW_YORK';
}

export function sessionLabel(s: Session) {
  if (s === 'ASIA') return 'Asia';
  if (s === 'LONDON') return 'London';
  if (s === 'OVERLAP') return 'London–NY Overlap';
  return 'New York';
}

function normalizeFilters(f: Filters): Filters {
  return {
    ...f,
    instrumentQuery: f.instrumentQuery.trim(),
  };
}

function filtersEqual(a: Filters, b: Filters) {
  const A = normalizeFilters(a);
  const B = normalizeFilters(b);
  return (
    A.rangeStart === B.rangeStart &&
    A.rangeEnd === B.rangeEnd &&
    A.instrumentQuery === B.instrumentQuery &&
    A.directionFilter === B.directionFilter &&
    A.sessionFilter === B.sessionFilter &&
    A.outcomeFilter === B.outcomeFilter &&
    A.reviewedFilter === B.reviewedFilter &&
    A.setupFilter === B.setupFilter
  );
}

function yyyyMmDd(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yyyyMm(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function calcNetPnl(t: AnalyticsTrade) {
  if (t.net_pnl !== null && t.net_pnl !== undefined) return Number(t.net_pnl);
  const gross = Number(t.pnl_amount || 0);
  const comm = Number(t.commission || 0);
  return gross - comm;
}

export function useAnalytics() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);

  const currency = profile?.base_currency ?? 'USD';
  const startingBalanceRaw = profile?.starting_balance;
  const hasStartingBalance =
    startingBalanceRaw !== null && startingBalanceRaw !== undefined;
  const startingBalance = hasStartingBalance ? toNumberSafe(startingBalanceRaw) : 0;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const today = useMemo(() => new Date(), []);

  const initialFilters = useMemo<Filters>(() => {
    return {
      rangeStart: yyyyMmDd(addDays(today, -90).toISOString()),
      rangeEnd: yyyyMmDd(today.toISOString()),
      instrumentQuery: '',
      directionFilter: '',
      sessionFilter: '',
      outcomeFilter: '',
      reviewedFilter: '',
      setupFilter: '',
    };
  }, [today]);

  const [draft, setDraft] = useState<Filters>(() => initialFilters);
  const [applied, setApplied] = useState<Filters>(() => initialFilters);

  const [setupTemplates, setSetupTemplates] = useState<AnalyticsSetupTemplate[]>([]);

  const [calendarMonth, setCalendarMonth] = useState(() =>
    yyyyMm(today.toISOString()),
  );
  const [calendarMode, setCalendarMode] = useState<'PNL_PERCENT' | 'PNL_DOLLAR'>(
    'PNL_PERCENT',
  );

  const [trades, setTrades] = useState<AnalyticsTrade[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (applied.instrumentQuery.trim()) c++;
    if (applied.directionFilter) c++;
    if (applied.outcomeFilter) c++;
    if (applied.reviewedFilter) c++;
    if (applied.setupFilter) c++;
    if (applied.sessionFilter) c++;
    return c;
  }, [applied]);

  const filtersSummary = useMemo(() => {
    const bits: string[] = [];
    bits.push(`${applied.rangeStart} → ${applied.rangeEnd}`);

    if (applied.instrumentQuery.trim())
      bits.push(`Instrument: ${applied.instrumentQuery.trim().toUpperCase()}`);
    if (applied.directionFilter) bits.push(`Dir: ${applied.directionFilter}`);
    if (applied.sessionFilter)
      bits.push(`Session: ${sessionLabel(applied.sessionFilter)}`);
    if (applied.outcomeFilter) bits.push(`Outcome: ${applied.outcomeFilter}`);
    if (applied.reviewedFilter === 'REVIEWED') bits.push('Reviewed');
    if (applied.reviewedFilter === 'NOT_REVIEWED') bits.push('Not reviewed');

    if (applied.setupFilter === 'NO_SETUP') bits.push('Setup: none');
    else if (applied.setupFilter) {
      const name = setupTemplates.find((s) => s.id === applied.setupFilter)?.name;
      bits.push(`Setup: ${name || 'Selected'}`);
    }

    return bits.join(' • ');
  }, [applied, setupTemplates]);

  const hasUnsavedChanges = useMemo(
    () => !filtersEqual(draft, applied),
    [draft, applied],
  );

  const instrumentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) {
      const s = (t.instrument || '').trim();
      if (s) set.add(s.toUpperCase());
    }
    return Array.from(set).sort();
  }, [trades]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await loadAnalyticsBootstrap();
        if (cancelled) return;

        setProfile(res.profile);
        setSetupTemplates(res.setupTemplates);
      } catch (e: unknown) {
        if (cancelled) return;

        const message = getErr(e, 'Failed to load analytics');
        if (message.toLowerCase().includes('not authenticated')) {
          router.push('/auth');
          return;
        }

        setMsg(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setMsg('');

      try {
        const start = startOfDay(new Date(`${applied.rangeStart}T00:00:00`));
        const end = endOfDay(new Date(`${applied.rangeEnd}T00:00:00`));

        const rows = await loadAnalyticsTradesInRange({
          startIso: start.toISOString(),
          endIso: end.toISOString(),
        });

        if (cancelled) return;
        setTrades(rows);
      } catch (e: unknown) {
        if (cancelled) return;

        const message = getErr(e, 'Failed to load trades');
        setMsg(message);
        setTrades([]);

        if (message.toLowerCase().includes('not authenticated')) {
          router.push('/auth');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applied.rangeStart, applied.rangeEnd, router]);

  const filteredTrades = useMemo(() => {
    const q = applied.instrumentQuery.trim().toUpperCase();

    return trades.filter((t) => {
      if (q && !t.instrument?.toUpperCase().includes(q)) return false;
      if (applied.directionFilter && t.direction !== applied.directionFilter)
        return false;
      if (applied.sessionFilter && getSessionUTC(t.opened_at) !== applied.sessionFilter)
        return false;
      if (applied.outcomeFilter && t.outcome !== applied.outcomeFilter)
        return false;
      if (applied.reviewedFilter === 'REVIEWED' && !t.reviewed_at) return false;
      if (applied.reviewedFilter === 'NOT_REVIEWED' && !!t.reviewed_at)
        return false;

      if (applied.setupFilter === 'NO_SETUP' && t.template_id !== null) return false;
      if (
        applied.setupFilter &&
        applied.setupFilter !== 'NO_SETUP' &&
        t.template_id !== applied.setupFilter
      ) {
        return false;
      }

      return true;
    });
  }, [trades, applied]);

  const stats = useMemo(() => {
    const list = filteredTrades;

    const totalTrades = list.length;
    const winners = list.filter((t) => t.outcome === 'WIN');
    const losers = list.filter((t) => t.outcome === 'LOSS');

    const winCount = winners.length;
    const lossCount = losers.length;
    const beCount = list.filter((t) => t.outcome === 'BREAKEVEN').length;

    const winShare = totalTrades ? (winCount / totalTrades) * 100 : 0;
    const lossShare = totalTrades ? (lossCount / totalTrades) * 100 : 0;
    const beShare = totalTrades ? (beCount / totalTrades) * 100 : 0;

    const winPctAvg = winCount
      ? winners.reduce((s, t) => s + Number(t.pnl_percent || 0), 0) / winCount
      : 0;

    const lossPctAvg = lossCount
      ? losers.reduce((s, t) => s + Number(t.pnl_percent || 0), 0) / lossCount
      : 0;

    const bestWinPct = winCount
      ? Math.max(...winners.map((t) => Number(t.pnl_percent || 0)))
      : 0;

    const worstLossPct = lossCount
      ? Math.min(...losers.map((t) => Number(t.pnl_percent || 0)))
      : 0;

    const durationMin = (t: AnalyticsTrade) => {
      if (!t.closed_at) return null;
      const mins =
        (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) /
        60000;
      return Number.isFinite(mins) && mins >= 0 ? mins : null;
    };

    const winDurations = winners
      .map(durationMin)
      .filter((n): n is number => n !== null);

    const lossDurations = losers
      .map(durationMin)
      .filter((n): n is number => n !== null);

    const avgWinDurationMin = winDurations.length
      ? winDurations.reduce((s, v) => s + v, 0) / winDurations.length
      : 0;

    const avgLossDurationMin = lossDurations.length
      ? lossDurations.reduce((s, v) => s + v, 0) / lossDurations.length
      : 0;

    const netPnls = list.map(calcNetPnl);
    const totalPnl = netPnls.reduce((s, v) => s + v, 0);

    const winRate = totalTrades ? (winCount / totalTrades) * 100 : 0;

    const grossProfit = netPnls.filter((v) => v > 0).reduce((s, v) => s + v, 0);
    const grossLossAbs = Math.abs(
      netPnls.filter((v) => v < 0).reduce((s, v) => s + v, 0),
    );
    const profitFactor =
      grossLossAbs > 0
        ? grossProfit / grossLossAbs
        : grossProfit > 0
          ? Infinity
          : 0;

    const avgWin = winCount
      ? winners.map(calcNetPnl).reduce((s, v) => s + v, 0) / winCount
      : 0;

    const avgLossAbs = lossCount
      ? Math.abs(losers.map(calcNetPnl).reduce((s, v) => s + v, 0) / lossCount)
      : 0;

    const rrr = avgLossAbs > 0 ? avgWin / avgLossAbs : avgWin > 0 ? Infinity : 0;

    const lossRate = 1 - (totalTrades ? winCount / totalTrades : 0);
    const expectancy = (winRate / 100) * avgWin - lossRate * avgLossAbs;

    const durationsMin = list
      .filter((t) => t.closed_at)
      .map(
        (t) =>
          (new Date(t.closed_at as string).getTime() -
            new Date(t.opened_at).getTime()) /
          60000,
      )
      .filter((n) => Number.isFinite(n) && n >= 0);

    const avgDurationMin = durationsMin.length
      ? durationsMin.reduce((s, v) => s + v, 0) / durationsMin.length
      : 0;

    const seq = list.map((t) =>
      t.outcome === 'WIN' ? 'W' : t.outcome === 'LOSS' ? 'L' : 'B',
    );
    let maxW = 0;
    let maxL = 0;
    let curW = 0;
    let curL = 0;
    const winRuns: number[] = [];
    const lossRuns: number[] = [];

    for (const s of seq) {
      if (s === 'W') {
        curW += 1;
        maxW = Math.max(maxW, curW);
        if (curL) lossRuns.push(curL);
        curL = 0;
      } else if (s === 'L') {
        curL += 1;
        maxL = Math.max(maxL, curL);
        if (curW) winRuns.push(curW);
        curW = 0;
      } else {
        if (curW) winRuns.push(curW);
        if (curL) lossRuns.push(curL);
        curW = 0;
        curL = 0;
      }
    }
    if (curW) winRuns.push(curW);
    if (curL) lossRuns.push(curL);

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const bestTrade = netPnls.length ? Math.max(...netPnls) : 0;
    const worstTrade = netPnls.length ? Math.min(...netPnls) : 0;

    return {
      totalTrades,
      winCount,
      lossCount,
      beCount,
      winShare,
      lossShare,
      beShare,
      avgWinDurationMin,
      avgLossDurationMin,
      winPctAvg,
      lossPctAvg,
      bestWinPct,
      worstLossPct,
      totalPnl,
      winRate,
      profitFactor,
      avgWin,
      avgLossAbs,
      rrr,
      expectancy,
      avgDurationMin,
      bestTrade,
      worstTrade,
      maxConsecutiveWins: maxW,
      avgConsecutiveWins: avg(winRuns),
      maxConsecutiveLosses: maxL,
      avgConsecutiveLosses: avg(lossRuns),
    };
  }, [filteredTrades]);

  const equitySeries = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const t of filteredTrades) {
      const day = yyyyMmDd(t.opened_at);
      byDay[day] = (byDay[day] || 0) + calcNetPnl(t);
    }

    const days = Object.keys(byDay).sort();

    const res = days.reduce(
      (acc, d) => {
        const dayNet = byDay[d] || 0;
        acc.cum += dayNet;
        const y = hasStartingBalance ? startingBalance + acc.cum : acc.cum;
        acc.series.push({ xLabel: d, y, meta: { dayNet, cumNet: acc.cum } });
        return acc;
      },
      { cum: 0, series: [] as LinePoint[] },
    );

    return res.series;
  }, [filteredTrades, hasStartingBalance, startingBalance]);

  const dailyNetSeries = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const t of filteredTrades) {
      const day = yyyyMmDd(t.opened_at);
      byDay[day] = (byDay[day] || 0) + calcNetPnl(t);
    }
    return Object.keys(byDay)
      .sort()
      .map((d) => ({ xLabel: d, y: byDay[d] }));
  }, [filteredTrades]);

  const monthlyNetBars = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const t of filteredTrades) {
      const m = yyyyMm(t.opened_at);
      byMonth[m] = (byMonth[m] || 0) + calcNetPnl(t);
    }
    return Object.keys(byMonth)
      .sort()
      .map((m) => ({ xLabel: m, y: byMonth[m] }));
  }, [filteredTrades]);

  const monthlyAdvanced = useMemo(() => {
    const byMonth: Record<
      string,
      {
        month: string;
        pnl: number;
        trades: number;
        wins: number;
        losses: number;
        be: number;
        winSum: number;
        lossSumAbs: number;
        winCount: number;
        lossCount: number;
        durationSumMin: number;
        durationCount: number;
        days: Set<string>;
      }
    > = {};

    for (const t of filteredTrades) {
      const m = yyyyMm(t.opened_at);
      if (!byMonth[m]) {
        byMonth[m] = {
          month: m,
          pnl: 0,
          trades: 0,
          wins: 0,
          losses: 0,
          be: 0,
          winSum: 0,
          lossSumAbs: 0,
          winCount: 0,
          lossCount: 0,
          durationSumMin: 0,
          durationCount: 0,
          days: new Set<string>(),
        };
      }

      const r = byMonth[m];
      const net = calcNetPnl(t);
      r.pnl += net;
      r.trades += 1;
      r.days.add(yyyyMmDd(t.opened_at));

      if (t.outcome === 'WIN') {
        r.wins += 1;
        r.winSum += net;
        r.winCount += 1;
      } else if (t.outcome === 'LOSS') {
        r.losses += 1;
        r.lossSumAbs += Math.abs(net);
        r.lossCount += 1;
      } else {
        r.be += 1;
      }

      if (t.closed_at) {
        const mins =
          (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) /
          60000;
        if (Number.isFinite(mins) && mins >= 0) {
          r.durationSumMin += mins;
          r.durationCount += 1;
        }
      }
    }

    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => {
        const winRate = r.trades ? (r.wins / r.trades) * 100 : 0;
        const avgWin = r.winCount ? r.winSum / r.winCount : 0;
        const avgLossAbs = r.lossCount ? r.lossSumAbs / r.lossCount : 0;
        const rrr = avgLossAbs > 0 ? avgWin / avgLossAbs : avgWin > 0 ? Infinity : 0;
        const lossRate = 1 - (r.trades ? r.wins / r.trades : 0);
        const expectancy = (winRate / 100) * avgWin - lossRate * avgLossAbs;
        const avgDurationMin = r.durationCount
          ? r.durationSumMin / r.durationCount
          : 0;

        return {
          month: r.month,
          trades: r.trades,
          pnl: r.pnl,
          winRate,
          wins: r.wins,
          losses: r.losses,
          be: r.be,
          rrr,
          expectancy,
          avgDurationMin,
          activeDays: r.days.size,
        };
      });
  }, [filteredTrades]);

  const dayOfWeekBars = useMemo(() => {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const byDow: number[] = Array(7).fill(0);

    for (const t of filteredTrades) {
      const d = new Date(t.opened_at);
      const dow = d.getDay();
      byDow[dow] += calcNetPnl(t);
    }

    return labels.map((lbl, i) => ({ xLabel: lbl, y: byDow[i] }));
  }, [filteredTrades]);

  const hourBars = useMemo(() => {
    const byHour: number[] = Array(24).fill(0);
    for (const t of filteredTrades) {
      const d = new Date(t.opened_at);
      const h = d.getHours();
      byHour[h] += calcNetPnl(t);
    }
    return byHour.map((v, h) => ({ xLabel: String(h), y: v }));
  }, [filteredTrades]);

  const symbolRanking = useMemo(() => {
    const map: Record<
      string,
      {
        symbol: string;
        pnl: number;
        trades: number;
        wins: number;
        losses: number;
      }
    > = {};

    for (const t of filteredTrades) {
      const s = (t.instrument || 'UNKNOWN').toUpperCase();
      if (!map[s]) {
        map[s] = { symbol: s, pnl: 0, trades: 0, wins: 0, losses: 0 };
      }
      map[s].pnl += calcNetPnl(t);
      map[s].trades += 1;
      if (t.outcome === 'WIN') map[s].wins += 1;
      if (t.outcome === 'LOSS') map[s].losses += 1;
    }

    return Object.values(map).sort((a, b) => b.pnl - a.pnl);
  }, [filteredTrades]);

  const topSymbols = symbolRanking.slice(0, 5);
  const bottomSymbols = symbolRanking.slice(-5).reverse();

  const directionPerf = useMemo(() => {
    const by: Record<
      Direction,
      {
        dir: Direction;
        trades: number;
        pnl: number;
        wins: number;
        losses: number;
      }
    > = {
      BUY: { dir: 'BUY', trades: 0, pnl: 0, wins: 0, losses: 0 },
      SELL: { dir: 'SELL', trades: 0, pnl: 0, wins: 0, losses: 0 },
    };

    for (const t of filteredTrades) {
      by[t.direction].trades += 1;
      by[t.direction].pnl += calcNetPnl(t);
      if (t.outcome === 'WIN') by[t.direction].wins += 1;
      if (t.outcome === 'LOSS') by[t.direction].losses += 1;
    }

    return Object.values(by).map((r) => ({
      ...r,
      winRate: r.trades ? (r.wins / r.trades) * 100 : 0,
    }));
  }, [filteredTrades]);

  const sessionPerf = useMemo(() => {
    const init: Record<
      Session,
      {
        session: Session;
        trades: number;
        pnl: number;
        wins: number;
        losses: number;
        be: number;
      }
    > = {
      ASIA: { session: 'ASIA', trades: 0, pnl: 0, wins: 0, losses: 0, be: 0 },
      LONDON: {
        session: 'LONDON',
        trades: 0,
        pnl: 0,
        wins: 0,
        losses: 0,
        be: 0,
      },
      OVERLAP: {
        session: 'OVERLAP',
        trades: 0,
        pnl: 0,
        wins: 0,
        losses: 0,
        be: 0,
      },
      NEW_YORK: {
        session: 'NEW_YORK',
        trades: 0,
        pnl: 0,
        wins: 0,
        losses: 0,
        be: 0,
      },
    };

    for (const t of filteredTrades) {
      const s = getSessionUTC(t.opened_at);
      init[s].trades += 1;
      init[s].pnl += calcNetPnl(t);
      if (t.outcome === 'WIN') init[s].wins += 1;
      else if (t.outcome === 'LOSS') init[s].losses += 1;
      else init[s].be += 1;
    }

    const order: Session[] = ['ASIA', 'LONDON', 'OVERLAP', 'NEW_YORK'];
    return order.map((s) => {
      const r = init[s];
      return {
        ...r,
        winRate: r.trades ? (r.wins / r.trades) * 100 : 0,
      };
    });
  }, [filteredTrades]);

  const sessionPnlBars = useMemo(
    () => sessionPerf.map((r) => ({ xLabel: sessionLabel(r.session), y: r.pnl })),
    [sessionPerf],
  );

  const calendarValueByDay = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const t of filteredTrades) {
      const day = yyyyMmDd(t.opened_at);
      if (!day.startsWith(calendarMonth)) continue;

      if (calendarMode === 'PNL_PERCENT') {
        byDay[day] = (byDay[day] || 0) + Number(t.pnl_percent || 0);
      } else {
        byDay[day] = (byDay[day] || 0) + calcNetPnl(t);
      }
    }
    return byDay;
  }, [filteredTrades, calendarMonth, calendarMode]);

  const sharpe = useMemo(() => {
    if (dailyNetSeries.length < 2) return null;

    const denom = hasStartingBalance && startingBalance > 0 ? startingBalance : 1;
    const returns = dailyNetSeries.map((p) => p.y / denom);

    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const variance =
      returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) /
      (returns.length - 1);
    const std = Math.sqrt(variance);

    if (!std || !Number.isFinite(std)) return null;
    const annualized = (mean / std) * Math.sqrt(252);
    return Number.isFinite(annualized) ? annualized : null;
  }, [dailyNetSeries, hasStartingBalance, startingBalance]);

  function applyDraftFilters() {
    setApplied(normalizeFilters(draft));
  }

  function clearFilters() {
    const cleared: Filters = {
      ...initialFilters,
      instrumentQuery: '',
      directionFilter: '',
      sessionFilter: '',
      outcomeFilter: '',
      reviewedFilter: '',
      setupFilter: '',
    };
    setDraft(cleared);
    setApplied(normalizeFilters(cleared));
  }

  function goDashboard() {
    router.push('/dashboard');
  }

  async function logout() {
    await logoutAnalytics();
    router.push('/auth');
  }

  return {
    loading,
    msg,
    currency,
    hasStartingBalance,
    startingBalance,

    draft,
    setDraft,
    showFilters,
    setShowFilters,

    setupTemplates,
    trades,
    filteredTrades,
    instrumentOptions,

    activeFilterCount,
    filtersSummary,
    hasUnsavedChanges,

    calendarMonth,
    setCalendarMonth,
    calendarMode,
    setCalendarMode,

    stats,
    equitySeries,
    dailyNetSeries,
    monthlyNetBars,
    monthlyAdvanced,
    dayOfWeekBars,
    hourBars,
    directionPerf,
    sessionPerf,
    sessionPnlBars,
    topSymbols,
    bottomSymbols,
    calendarValueByDay,
    sharpe,

    applyDraftFilters,
    clearFilters,
    goDashboard,
    logout,
  };
}
