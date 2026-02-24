import { supabase } from '@/src/lib/supabase/client';

export type TradeCriteriaCheckUpsert = {
  trade_id: string;
  item_id: string;
  checked: boolean;
};

export async function upsertTradeCriteriaChecks(
  rows: TradeCriteriaCheckUpsert[],
): Promise<void> {
  if (!rows.length) return;

  const { error } = await supabase
    .from('trade_criteria_checks')
    .upsert(rows, { onConflict: 'trade_id,item_id' });

  if (error) throw error;
}

export type TradeCheckRow = {
  trade_id: string;
  item_id: string;
  checked: boolean;
};

export async function listTradeChecks(params: {
  tradeId: string;
  itemIds: string[];
}): Promise<TradeCheckRow[]> {
  if (!params.itemIds.length) return [];

  const { data, error } = await supabase
    .from('trade_criteria_checks')
    .select('trade_id, item_id, checked')
    .eq('trade_id', params.tradeId)
    .in('item_id', params.itemIds);

  if (error) throw error;
  return (data ?? []) as TradeCheckRow[];
}