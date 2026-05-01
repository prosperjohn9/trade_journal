'use client';

import { apiFetch } from '@/src/lib/api/fetcher';
import type { TradeChecklistItem, TradeView } from '@/src/hooks/useTradeView';

export async function loadTradeView(params: { tradeId: string }) {
  return apiFetch<{
    trade: TradeView;
    beforeUrl: string;
    afterUrl: string;
    items: TradeChecklistItem[];
    checks: Record<string, boolean>;
    equityBefore: number | null;
  }>(`/api/trade-view/${params.tradeId}`);
}
