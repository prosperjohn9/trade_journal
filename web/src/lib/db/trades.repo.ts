import { supabase } from '@/src/lib/supabase/client';
import { monthToRange } from '@/src/lib/analytics/core';

export type TradeDbRow = {
  id: string;
  opened_at: string;
  instrument: string | null;
  direction: 'BUY' | 'SELL' | null;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' | null;
  pnl_amount: number | null;
  pnl_percent: number | null;
  risk_amount: number | null;
  r_multiple: number | null;
  commission: number | null;
  net_pnl: number | null;
  reviewed_at: string | null;
  account_id: string | null;
  template_id: string | null;
};

export type TradeNetLiteRow = Pick<
  TradeDbRow,
  'pnl_amount' | 'pnl_percent' | 'commission' | 'net_pnl' | 'reviewed_at'
>;

export type ChecklistDataResult = {
  base: Record<string, number | null>;
  activeItems: Array<{ id: string; template_id: string }>;
  denomByTemplate: Record<string, number>;
  checkedTrueByTrade: Record<string, number>;
};

export async function fetchTradesForMonth(params: {
  userId: string;
  month: string;
  accountId?: string | 'all';
}): Promise<TradeDbRow[]> {
  const { userId, month, accountId } = params;
  const { startIso, endIso } = monthToRange(month);

  let q = supabase
    .from('trades')
    .select(
      'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, risk_amount, r_multiple, commission, net_pnl, reviewed_at, account_id, template_id',
    )
    .eq('user_id', userId)
    .gte('opened_at', startIso)
    .lt('opened_at', endIso);

  if (accountId && accountId !== 'all') {
    q = q.eq('account_id', accountId);
  }

  const { data, error } = await q.order('opened_at', { ascending: true });
  if (error) throw error;

  return (data ?? []) as TradeDbRow[];
}

export async function fetchTradesBeforeMonth(params: {
  userId: string;
  month: string;
  accountId?: string | 'all';
}): Promise<TradeNetLiteRow[]> {
  const { userId, month, accountId } = params;
  const { startIso } = monthToRange(month);

  let q = supabase
    .from('trades')
    .select('pnl_amount, pnl_percent, commission, net_pnl, reviewed_at')
    .eq('user_id', userId)
    .lt('opened_at', startIso);

  if (accountId && accountId !== 'all') {
    q = q.eq('account_id', accountId);
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []) as TradeNetLiteRow[];
}

export async function deleteTradeById(id: string): Promise<void> {
  const { error } = await supabase.from('trades').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchChecklistData(params: {
  tradeIds: string[];
  templateIds: string[];
}): Promise<ChecklistDataResult> {
  const base: Record<string, number | null> = {};
  for (const id of params.tradeIds) base[id] = null;

  const empty: ChecklistDataResult = {
    base,
    activeItems: [],
    denomByTemplate: {},
    checkedTrueByTrade: {},
  };

  if (!params.tradeIds.length || !params.templateIds.length) return empty;

  const { data: itemsData, error: itemsErr } = await supabase
    .from('setup_template_items')
    .select('id, template_id, is_active')
    .in('template_id', params.templateIds)
    .eq('is_active', true);

  if (itemsErr) throw itemsErr;

  const activeItems = (itemsData ?? []) as Array<{
    id: string;
    template_id: string;
  }>;
  const denomByTemplate: Record<string, number> = {};
  const activeItemIds = activeItems.map((i) => i.id);

  for (const it of activeItems) {
    denomByTemplate[it.template_id] =
      (denomByTemplate[it.template_id] || 0) + 1;
  }

  if (!activeItemIds.length) return { ...empty, activeItems, denomByTemplate };

  const { data: checksData, error: checksErr } = await supabase
    .from('trade_criteria_checks')
    .select('trade_id, item_id, checked')
    .in('trade_id', params.tradeIds)
    .in('item_id', activeItemIds);

  if (checksErr) throw checksErr;

  const checks = (checksData ?? []) as Array<{
    trade_id: string;
    checked: boolean;
  }>;
  const checkedTrueByTrade: Record<string, number> = {};

  for (const row of checks) {
    if (row.checked) {
      checkedTrueByTrade[row.trade_id] =
        (checkedTrueByTrade[row.trade_id] || 0) + 1;
    }
  }

  return { base, activeItems, denomByTemplate, checkedTrueByTrade };
}

const TRADE_VIEW_SELECT = `
  id, opened_at,
  instrument, direction, outcome,
  pnl_amount, pnl_percent, risk_amount, r_multiple,
  account_id,
  account:accounts(id, name),
  template_id, notes, reviewed_at,
  entry_price, stop_loss, take_profit, exit_price, closed_at, commission, net_pnl,
  emotion_tag, lesson_learned, review_notes,
  before_screenshot_path, after_trade_screenshot_url
`;

export async function getTradeById(tradeId: string) {
  const { data, error } = await supabase
    .from('trades')
    .select(TRADE_VIEW_SELECT)
    .eq('id', tradeId)
    .single();

  if (error) throw error;
  return data;
}