import { requireUser } from '@/src/lib/supabase/auth';
import { supabase } from '@/src/lib/supabase/client';
import {
  createAccountForUser,
  deleteAccount as deleteAccountRepo,
  fetchAccountsByUser,
  setDefaultAccount as setDefaultAccountRepo,
  updateAccountForUser,
  type AccountRow,
  type CreateAccountInput,
  type UpdateAccountInput,
} from '@/src/lib/db/accounts.repo';
import {
  fromDbAccountType,
  normalizeAccountTags,
  toDbAccountType,
  type Account,
} from '@/src/domain/account';

type AccountTradeStats = {
  trade_count: number;
  net_pnl: number;
};

type TradeRollupRow = {
  account_id: string | null;
  pnl_amount: number | null;
  net_pnl: number | null;
  commission: number | null;
};

function calcTradeNet(row: TradeRollupRow): number {
  const net = Number(row.net_pnl);
  if (Number.isFinite(net)) return net;

  const pnl = Number(row.pnl_amount);
  const commission = Number(row.commission);
  return (Number.isFinite(pnl) ? pnl : 0) - (Number.isFinite(commission) ? commission : 0);
}

async function fetchAccountTradeStats(
  userId: string,
): Promise<Record<string, AccountTradeStats>> {
  const { data, error } = await supabase
    .from('trades')
    .select('account_id, pnl_amount, net_pnl, commission')
    .eq('user_id', userId)
    .not('account_id', 'is', null);

  if (error) throw error;

  const out: Record<string, AccountTradeStats> = {};
  for (const row of (data ?? []) as TradeRollupRow[]) {
    if (!row.account_id) continue;
    const current = out[row.account_id] ?? { trade_count: 0, net_pnl: 0 };
    current.trade_count += 1;
    current.net_pnl += calcTradeNet(row);
    out[row.account_id] = current;
  }

  return out;
}

function mapAccount(
  row: AccountRow,
  stats?: AccountTradeStats,
): Account {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    account_type: fromDbAccountType(row.account_type),
    tags: normalizeAccountTags(row.tags),
    starting_balance: row.starting_balance,
    base_currency: row.base_currency,
    is_default: row.is_default,
    trade_count: stats?.trade_count ?? 0,
    net_pnl: stats?.net_pnl ?? 0,
    created_at: row.created_at,
  };
}

export async function listAccounts(): Promise<Account[]> {
  const user = await requireUser();
  const [rows, statsByAccountId] = await Promise.all([
    fetchAccountsByUser(user.id),
    fetchAccountTradeStats(user.id),
  ]);
  return rows.map((row) => mapAccount(row, statsByAccountId[row.id]));
}

export async function createAccount(
  input: CreateAccountInput,
): Promise<Account> {
  const user = await requireUser();
  const row = await createAccountForUser(user.id, {
    ...input,
    account_type: toDbAccountType(input.account_type),
    tags: normalizeAccountTags(input.tags),
  });
  return mapAccount(row, { trade_count: 0, net_pnl: 0 });
}

export async function updateAccount(
  accountId: string,
  input: UpdateAccountInput,
): Promise<Account> {
  const user = await requireUser();
  const row = await updateAccountForUser(user.id, accountId, {
    ...input,
    account_type:
      input.account_type === undefined
        ? undefined
        : toDbAccountType(input.account_type),
    tags: input.tags === undefined ? undefined : normalizeAccountTags(input.tags),
  });
  return mapAccount(row);
}

export async function setDefaultAccount(accountId: string): Promise<void> {
  const user = await requireUser();
  await setDefaultAccountRepo(user.id, accountId);
}

export async function deleteAccount(accountId: string): Promise<void> {
  const user = await requireUser();
  await deleteAccountRepo(user.id, accountId);
}
