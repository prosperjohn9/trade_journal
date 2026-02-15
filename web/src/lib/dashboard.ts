

// src/lib/dashboard.ts

import { supabase } from '@/src/lib/supabaseClient';

export type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
export type Direction = 'BUY' | 'SELL';

export type TradeRow = {
  id: string;
  account_id: string;
  opened_at: string;
  instrument: string;
  direction: Direction;
  outcome: Outcome;
  pnl_amount: number;
  pnl_percent: number;
  commission: number | null;
  net_pnl: number | null;
  r_multiple: number | null;
  template_id: string | null;
  reviewed_at: string | null;
};

export type AccountRow = {
  id: string;
  name: string;
  starting_balance: number | null;
  is_default?: boolean | null;
};

type PriorPnlRow = {
  net_pnl: number | null;
  pnl_amount: number | null;
  commission: number | null;
  reviewed_at: string | null;
};

type TemplateItemRow = {
  id: string;
  template_id: string;
  is_active: boolean;
};

type CriteriaCheckRow = {
  trade_id: string;
  item_id: string;
  checked: boolean;
};

function toNumberSafe(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthRange(month: string): { start: Date; end: Date } {
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

// P&L logic:
// - If trade is NOT reviewed, treat net_pnl as unavailable and fall back to gross pnl_amount.
// - If reviewed, prefer stored net_pnl, else fall back to (gross - commission).
export function calcDisplayPnlFromRow(r: PriorPnlRow): number {
  const gross = toNumberSafe(r.pnl_amount ?? 0);

  // Not reviewed => gross only
  if (!r.reviewed_at) return gross;

  const net = Number(r.net_pnl);
  if (Number.isFinite(net)) return net;

  const comm = toNumberSafe(r.commission ?? 0);
  return gross - comm;
}

export async function fetchDashboardAccounts(userId: string): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, starting_balance, is_default')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as AccountRow[];
}

export async function fetchTradesForMonth(params: {
  month: string;
  accountId: string; // specific id or 'all'
}): Promise<TradeRow[]> {
  const { start, end } = monthRange(params.month);

  let q = supabase
    .from('trades')
    .select(
      'id, account_id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, commission, net_pnl, r_multiple, template_id, reviewed_at',
    )
    .gte('opened_at', start.toISOString())
    .lt('opened_at', end.toISOString());

  if (params.accountId !== 'all') {
    q = q.eq('account_id', params.accountId);
  }

  const { data, error } = await q.order('opened_at', { ascending: true });
  if (error) throw error;

  return (data ?? []) as TradeRow[];
}

export async function fetchPriorPnl(params: {
  month: string;
  accountId: string; // specific id or 'all'
}): Promise<number> {
  const { start } = monthRange(params.month);

  let q = supabase
    .from('trades')
    .select('net_pnl, pnl_amount, commission, reviewed_at, account_id')
    .lt('opened_at', start.toISOString());

  if (params.accountId !== 'all') {
    q = q.eq('account_id', params.accountId);
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as PriorPnlRow[];
  return rows.reduce((acc, r) => acc + calcDisplayPnlFromRow(r), 0);
}

export async function fetchChecklistScores(
  trades: Array<Pick<TradeRow, 'id' | 'template_id'>>,
): Promise<Record<string, number | null>> {
  const base: Record<string, number | null> = {};
  for (const t of trades) base[t.id] = null;

  if (!trades.length) return base;

  const tradeIds = trades.map((t) => t.id);
  const templateIds = Array.from(
    new Set(trades.map((t) => t.template_id).filter(Boolean)),
  ) as string[];

  if (!templateIds.length) return base;

  // Denominator: number of active items per template.
  const { data: itemsData, error: itemsErr } = await supabase
    .from('setup_template_items')
    .select('id, template_id, is_active')
    .in('template_id', templateIds)
    .eq('is_active', true);

  if (itemsErr) throw itemsErr;

  const activeItems = (itemsData ?? []) as TemplateItemRow[];
  const denomByTemplate: Record<string, number> = {};
  const activeItemIds = activeItems.map((i) => i.id);

  for (const it of activeItems) {
    denomByTemplate[it.template_id] = (denomByTemplate[it.template_id] || 0) + 1;
  }

  if (!activeItemIds.length) return base;

  // Numerator: checked=true rows per trade (restricted to active items).
  const { data: checksData, error: checksErr } = await supabase
    .from('trade_criteria_checks')
    .select('trade_id, item_id, checked')
    .in('trade_id', tradeIds)
    .in('item_id', activeItemIds);

  if (checksErr) throw checksErr;

  const checks = (checksData ?? []) as CriteriaCheckRow[];
  const checkedTrueByTrade: Record<string, number> = {};

  for (const row of checks) {
    if (row.checked) {
      checkedTrueByTrade[row.trade_id] = (checkedTrueByTrade[row.trade_id] || 0) + 1;
    }
  }

  const out: Record<string, number | null> = { ...base };

  for (const t of trades) {
    if (!t.template_id) {
      out[t.id] = null;
      continue;
    }

    const denom = denomByTemplate[t.template_id] || 0;
    if (!denom) {
      out[t.id] = null;
      continue;
    }

    const num = checkedTrueByTrade[t.id] || 0;
    out[t.id] = (num / denom) * 100;
  }

  return out;
}

export async function deleteTradeById(id: string): Promise<void> {
  const { error } = await supabase.from('trades').delete().eq('id', id);
  if (error) throw error;
}