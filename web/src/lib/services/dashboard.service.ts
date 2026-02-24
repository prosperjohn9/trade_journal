import { requireUser } from '@/src/lib/supabase/auth';
import { getOrCreateProfile } from '@/src/lib/db/profiles.repo';
import { fetchAccountsByUser } from '@/src/lib/db/accounts.repo';
import {
  deleteTradeById,
  fetchTradesBeforeMonth,
  fetchTradesForMonth,
} from '@/src/lib/db/trades.repo';
import { toNumberSafe } from '@/src/lib/utils/number';

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

type PriorPnlRow = {
  net_pnl: number | null;
  pnl_amount: number | null;
  commission: number | null;
  reviewed_at: string | null;
};

export function calcDisplayPnlFromRow(r: PriorPnlRow): number {
  const gross = toNumberSafe(r.pnl_amount, 0);
  if (!r.reviewed_at) return gross;

  const net = Number(r.net_pnl);
  if (Number.isFinite(net)) return net;

  const comm = toNumberSafe(r.commission, 0);
  return gross - comm;
}

export async function loadDashboard(params: {
  month: string;
  accountId: string | 'all';
}) {
  await requireUser();

  const { userId, profile } = await getOrCreateProfile();
  const accounts = await fetchAccountsByUser(userId);

  const selectedAccount =
    params.accountId === 'all'
      ? null
      : (accounts.find((a) => a.id === params.accountId) ?? null);

  const currency = profile.base_currency ?? 'USD';

  const monthTradesRaw = await fetchTradesForMonth({
    userId,
    month: params.month,
    accountId: params.accountId,
  });

  const trades: TradeDisplay[] = monthTradesRaw.map((t) => ({
    id: t.id,
    account_id: t.account_id ?? '',
    opened_at: t.opened_at,
    instrument: (t.instrument ?? '').toUpperCase(),
    direction: t.direction === 'SELL' ? 'SELL' : 'BUY',
    outcome:
      t.outcome === 'WIN' ? 'WIN' : t.outcome === 'LOSS' ? 'LOSS' : 'BREAKEVEN',
    pnl_amount: toNumberSafe(t.pnl_amount, 0),
    pnl_percent: toNumberSafe(t.pnl_percent, 0),
    commission: t.commission,
    net_pnl: t.net_pnl,
    r_multiple: t.r_multiple,
    template_id: t.template_id,
    reviewed_at: t.reviewed_at,
  }));

  const priorRows = await fetchTradesBeforeMonth({
    userId,
    month: params.month,
    accountId: params.accountId,
  });

  const priorPnlDollar = priorRows.reduce((acc, row) => {
    return (
      acc +
      calcDisplayPnlFromRow({
        net_pnl: row.net_pnl ?? null,
        pnl_amount: row.pnl_amount ?? null,
        commission: row.commission ?? null,
        reviewed_at: row.reviewed_at ?? null,
      })
    );
  }, 0);

  const allAccountsStartingBalance = accounts.reduce(
    (acc, a) => acc + toNumberSafe(a.starting_balance, 0),
    0,
  );

  const hasStartingBalance =
    params.accountId === 'all'
      ? true
      : selectedAccount?.starting_balance !== null &&
        selectedAccount?.starting_balance !== undefined;

  const startingBalance = selectedAccount
    ? toNumberSafe(selectedAccount.starting_balance, 0)
    : 0;

  const monthStartingBalance =
    params.accountId === 'all'
      ? allAccountsStartingBalance + priorPnlDollar
      : hasStartingBalance
        ? startingBalance + priorPnlDollar
        : null;

  return {
    userId,
    profile,
    currency,
    accounts,
    selectedAccount,
    trades,
    priorPnlDollar,
    monthStartingBalance,
  };
}

export async function removeTrade(tradeId: string) {
  await requireUser();
  await deleteTradeById(tradeId);
}