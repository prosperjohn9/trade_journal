'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { getErr } from '@/src/domain/errors';
import { loadTradeView } from '@/src/lib/services/tradeView.service';

export type TradeViewDirection = 'BUY' | 'SELL';
export type TradeViewOutcome = 'WIN' | 'LOSS' | 'BREAKEVEN';

export type TradeView = {
  id: string;
  opened_at: string;

  instrument: string;
  direction: TradeViewDirection;
  outcome: TradeViewOutcome;

  pnl_amount: number;
  pnl_percent: number;
  risk_amount: number | null;
  r_multiple: number | null;

  template_id: string | null;
  notes: string | null;

  reviewed_at: string | null;

  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  exit_price: number | null;
  closed_at: string | null;
  commission: number | null;
  net_pnl: number | null;

  emotion_tag: string | null;
  lesson_learned: string | null;
  review_notes: string | null;

  before_screenshot_path: string | null;
  after_trade_screenshot_url: string | null;
  account_id: string | null;
  account: {
    id: string;
    name: string;
    account_type?: string | null;
    tags?: string[] | null;
    base_currency?: string | null;
    starting_balance?: number | null;
  } | null;
};

export type TradeChecklistItem = {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export function useTradeView() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const tradeId = params.id;

  const { data, error, isLoading } = useSWR(
    tradeId ? ['trade-view', tradeId] : null,
    () => loadTradeView({ tradeId }),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  if (error) {
    const message = getErr(error, 'Trade not found');
    if (message.toLowerCase().includes('not authenticated')) {
      router.push('/auth');
    }
  }

  const trade = data?.trade ?? null;
  const items = data?.items ?? [];
  const checks = data?.checks ?? {};
  const beforeUrl = data?.beforeUrl ?? '';
  const afterUrl = data?.afterUrl ?? '';
  const equityBefore = data?.equityBefore ?? null;

  const isReviewed = !!trade?.reviewed_at;

  const activeItems = useMemo(() => items.filter((i) => i.is_active), [items]);

  const adherence = useMemo(() => {
    const total = activeItems.length;
    if (!total) return { total: 0, checked: 0, missed: 0, pct: 0 };

    const checkedCount = activeItems.filter((i) => checks[i.id]).length;
    const missed = total - checkedCount;

    return {
      total,
      checked: checkedCount,
      missed,
      pct: (checkedCount / total) * 100,
    };
  }, [activeItems, checks]);

  const grossPnl = Number(trade?.pnl_amount ?? 0);
  const commission = Number(trade?.commission ?? 0);
  const netPnl =
    trade?.net_pnl !== null && trade?.net_pnl !== undefined
      ? Number(trade.net_pnl)
      : grossPnl - commission;

  const msg = isLoading
    ? 'Loading…'
    : error
      ? getErr(error, 'Trade not found')
      : '';

  function openFull(url: string) {
    if (!url) return;
    window.open(url, '_blank');
  }

  return {
    trade,
    msg,

    items,
    checks,
    activeItems,
    adherence,

    beforeUrl,
    afterUrl,
    equityBefore,

    isReviewed,
    grossPnl,
    netPnl,

    openFull,
  };
}
