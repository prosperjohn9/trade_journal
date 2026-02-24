import { requireUser } from '@/src/lib/supabase/auth';
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
import type { Account } from '@/src/domain/account';

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    starting_balance: row.starting_balance,
    base_currency: row.base_currency,
    is_default: row.is_default,
    created_at: row.created_at,
  };
}

export async function listAccounts(): Promise<Account[]> {
  const user = await requireUser();
  const rows = await fetchAccountsByUser(user.id);
  return rows.map(mapAccount);
}

export async function createAccount(
  input: CreateAccountInput,
): Promise<Account> {
  const user = await requireUser();
  const row = await createAccountForUser(user.id, input);
  return mapAccount(row);
}

export async function updateAccount(
  accountId: string,
  input: UpdateAccountInput,
): Promise<Account> {
  const user = await requireUser();
  const row = await updateAccountForUser(user.id, accountId, input);
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