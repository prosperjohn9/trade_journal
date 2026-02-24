// src/lib/db/tradesWrite.repo.ts
import { supabase } from '@/src/lib/supabase/client';

export type CreateTradeInput = {
  user_id: string;
  account_id: string;
  opened_at: string;

  instrument: string;
  direction: 'BUY' | 'SELL';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';

  pnl_amount: number;
  pnl_percent: number;
  risk_amount: number | null;
  r_multiple: number | null;

  notes: string | null;
  template_id: string | null;
};

export async function createTradeRow(
  input: CreateTradeInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('trades')
    .insert(input)
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('Failed to create trade.');
  return { id: data.id as string };
}

export async function updateTradeBeforeScreenshotPath(
  tradeId: string,
  path: string,
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .update({ before_screenshot_path: path })
    .eq('id', tradeId);

  if (error) throw error;
}

export type TradeEntryUpdate = {
  opened_at?: string;
  instrument?: string;
  direction?: 'BUY' | 'SELL';
  outcome?: 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnl_amount?: number;
  pnl_percent?: number;
  risk_amount?: number | null;
  r_multiple?: number | null;
  notes?: string | null;
  template_id?: string | null;
};

export async function updateTradeEntryFields(
  tradeId: string,
  updates: TradeEntryUpdate,
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .update(updates)
    .eq('id', tradeId);
  if (error) throw error;
}

export type TradeReviewUpdate = {
  // ✅ FIX: allow template_id in review updates (your TS error was here)
  template_id?: string | null;

  reviewed_at?: string;

  entry_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  exit_price?: number | null;
  closed_at?: string | null;

  commission?: number | null;
  net_pnl?: number | null;

  emotion_tag?: string | null;
  lesson_learned?: string | null;
  review_notes?: string | null;

  after_trade_screenshot_url?: string | null;
};

export async function updateTradeReviewFields(
  tradeId: string,
  updates: TradeReviewUpdate,
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .update(updates)
    .eq('id', tradeId);
  if (error) throw error;
}

export type TradeScreenshotPathUpdate = {
  before_screenshot_path?: string | null;
  after_trade_screenshot_url?: string | null;
};

export async function updateTradeScreenshotPaths(
  tradeId: string,
  updates: TradeScreenshotPathUpdate,
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .update(updates)
    .eq('id', tradeId);
  if (error) throw error;
}