'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErr } from '@/src/domain/errors';
import { toNumberSafe } from '@/src/lib/utils/number';
import { loadTrades, removeTrade } from '@/src/lib/services/trades.service';
import type { TradeDbRow } from '@/src/lib/db/trades.repo';

function getDefaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export type UseTradesRow = TradeDbRow;

export function useTrades() {
  const router = useRouter();

  const [month, setMonth] = useState<string>(getDefaultMonth);
  const [accountId, setAccountId] = useState<string | 'all'>('all');

  const [trades, setTrades] = useState<UseTradesRow[]>([]);
  const [checklistScoreByTrade, setChecklistScoreByTrade] = useState<
    Record<string, number | null>
  >({});

  const [loading, setLoading] = useState<boolean>(true);
  const [msg, setMsg] = useState<string>('');

  const [deleteTarget, setDeleteTarget] = useState<UseTradesRow | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setMsg('');

    try {
      const res = await loadTrades({ month, accountId });

      setTrades(res.trades ?? []);

      const base: Record<string, number | null> = {};
      for (const t of res.trades ?? []) base[t.id] = null;

      setChecklistScoreByTrade({
        ...base,
        ...(res.checklistScoreByTrade ?? {}),
      });
    } catch (e: unknown) {
      const message = getErr(e, 'Failed to load trades');
      setMsg(message);
      setTrades([]);
      setChecklistScoreByTrade({});

      if (message.toLowerCase().includes('not authenticated')) {
        router.push('/auth');
      }
    } finally {
      setLoading(false);
    }
  }, [accountId, month, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stats = useMemo(() => {
    const total = trades.length;
    const wins = trades.filter((t) => t.outcome === 'WIN').length;
    const losses = trades.filter((t) => t.outcome === 'LOSS').length;
    const breakeven = trades.filter((t) => t.outcome === 'BREAKEVEN').length;

    const pnlDollar = trades.reduce(
      (acc, t) => acc + toNumberSafe(t.pnl_amount, 0),
      0,
    );
    const winRate = total ? (wins / total) * 100 : 0;

    return { total, wins, losses, breakeven, pnlDollar, winRate };
  }, [trades]);

  function requestDelete(t: UseTradesRow) {
    setDeleteTarget(t);
  }

  function closeDelete() {
    if (deleting) return;
    setDeleteTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleting) return;

    setDeleting(true);
    try {
      await removeTrade(deleteTarget.id);

      setTrades((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setChecklistScoreByTrade((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });

      setDeleteTarget(null);
    } catch (e: unknown) {
      alert(getErr(e, 'Failed to delete trade'));
    } finally {
      setDeleting(false);
    }
  }

  return {
    month,
    setMonth,
    accountId,
    setAccountId,

    trades,
    checklistScoreByTrade,
    loading,
    msg,
    stats,

    reload,

    deleteTarget,
    deleting,
    requestDelete,
    closeDelete,
    confirmDelete,
    setDeleteTarget,
  };
}