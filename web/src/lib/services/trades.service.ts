import { requireUser } from '@/src/lib/supabase/auth';
import {
  deleteTradeById,
  fetchChecklistData,
  fetchTradesForMonth,
  type TradeDbRow,
} from '@/src/lib/db/trades.repo';

export type TradesLoadResult = {
  trades: TradeDbRow[];
  checklistScoreByTrade: Record<string, number | null>;
};

function buildChecklistScores(params: {
  trades: TradeDbRow[];
  base: Record<string, number | null>;
  denomByTemplate: Record<string, number>;
  checkedTrueByTrade: Record<string, number>;
}): Record<string, number | null> {
  const { trades, base, denomByTemplate, checkedTrueByTrade } = params;

  const out: Record<string, number | null> = { ...base };

  for (const t of trades) {
    const tpl = t.template_id ?? null;
    if (!tpl) {
      out[t.id] = null;
      continue;
    }

    const denom = denomByTemplate[tpl] || 0;
    if (!denom) {
      out[t.id] = null;
      continue;
    }

    const num = checkedTrueByTrade[t.id] || 0;
    out[t.id] = (num / denom) * 100;
  }

  return out;
}

export async function loadTrades(params: {
  month: string;
  accountId: string | 'all';
}): Promise<TradesLoadResult> {
  const user = await requireUser();

  const trades = await fetchTradesForMonth({
    userId: user.id,
    month: params.month,
    accountId: params.accountId,
  });

  const tradeIds = trades.map((t) => t.id);
  const templateIds = Array.from(
    new Set(trades.map((t) => t.template_id).filter(Boolean)),
  ) as string[];

  const base: Record<string, number | null> = {};
  for (const id of tradeIds) base[id] = null;

  if (!tradeIds.length || !templateIds.length) {
    return { trades, checklistScoreByTrade: base };
  }

  const { denomByTemplate, checkedTrueByTrade } = await fetchChecklistData({
    tradeIds,
    templateIds,
  });

  const checklistScoreByTrade = buildChecklistScores({
    trades,
    base,
    denomByTemplate,
    checkedTrueByTrade,
  });

  return { trades, checklistScoreByTrade };
}

export async function removeTrade(tradeId: string): Promise<void> {
  await requireUser();
  await deleteTradeById(tradeId);
}