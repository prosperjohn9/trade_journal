'use client';

import { apiFetch, buildQuery } from '@/src/lib/api/fetcher';
import { deleteTradeById } from '@/src/lib/db/trades.repo';
import { requireUser } from '@/src/lib/supabase/auth';
import { toNumberSafe } from '@/src/lib/utils/number';
import type { Profile } from '@/src/domain/profile';

export type TradeDisplay = {
  id: string;
  account_id: string;
  opened_at: string;
  instrument: string;
  direction: 'BUY' | 'SELL';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnl_amount: number;
  pnl_percent: number;
  commission: number | null;
  net_pnl: number | null;
  r_multiple: number | null;
  template_id: string | null;
  reviewed_at: string | null;
};

export type AccountDisplay = {
  id: string;
  user_id: string;
  name: string;
  account_type?: string | null;
  tags?: string[] | null;
  starting_balance: number;
  base_currency: string | null;
  is_default: boolean;
  created_at: string;
};

export function calcDisplayPnlFromRow(r: {
  net_pnl: number | null;
  pnl_amount: number | null;
  commission: number | null;
  reviewed_at: string | null;
}): number {
  const gross = toNumberSafe(r.pnl_amount, 0);
  if (!r.reviewed_at) return gross;
  const net = Number(r.net_pnl);
  if (Number.isFinite(net)) return net;
  return gross - toNumberSafe(r.commission, 0);
}

export async function loadDashboard(params: {
  month: string;
  accountId: string | 'all';
}): Promise<{
  userId: string;
  profile: Profile;
  accounts: AccountDisplay[];
  trades: TradeDisplay[];
  priorPnlDollar: number;
}> {
  const qs = buildQuery({ month: params.month, accountId: params.accountId });
  const raw = await apiFetch<{
    userId: string;
    profile: Profile;
    accounts: AccountDisplay[];
    trades: Array<Record<string, unknown>>;
    priorPnlDollar: number;
  }>(`/api/dashboard${qs}`);

  return {
    ...raw,
    trades: raw.trades.map((t) => ({
      id: String(t.id ?? ''),
      account_id: String(t.account_id ?? ''),
      opened_at: String(t.opened_at ?? ''),
      instrument: String(t.instrument ?? '').toUpperCase(),
      direction: t.direction === 'SELL' ? 'SELL' : 'BUY',
      outcome: t.outcome === 'WIN' ? 'WIN' : t.outcome === 'LOSS' ? 'LOSS' : 'BREAKEVEN',
      pnl_amount: toNumberSafe(t.pnl_amount, 0),
      pnl_percent: toNumberSafe(t.pnl_percent, 0),
      commission: t.commission != null ? Number(t.commission) : null,
      net_pnl: t.net_pnl != null ? Number(t.net_pnl) : null,
      r_multiple: t.r_multiple != null ? Number(t.r_multiple) : null,
      template_id: t.template_id != null ? String(t.template_id) : null,
      reviewed_at: t.reviewed_at != null ? String(t.reviewed_at) : null,
    })),
  };
}

export async function removeTrade(tradeId: string) {
  await requireUser();
  await deleteTradeById(tradeId);
}
