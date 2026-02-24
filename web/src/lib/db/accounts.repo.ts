import { supabase } from '@/src/lib/supabase/client';

export type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  starting_balance: number;
  base_currency: string | null;
  is_default: boolean;
  created_at: string;
};

export type CreateAccountInput = {
  name: string;
  starting_balance: number;
  base_currency: string | null;
};

export type UpdateAccountInput = {
  name?: string;
  starting_balance?: number;
  base_currency?: string | null;
};

export async function fetchAccountsByUser(
  userId: string,
): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select(
      'id, user_id, name, starting_balance, base_currency, is_default, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as AccountRow[];
}

export async function createAccountForUser(
  userId: string,
  input: CreateAccountInput,
): Promise<AccountRow> {
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      user_id: userId,
      name: input.name,
      starting_balance: input.starting_balance,
      base_currency: input.base_currency,
    })
    .select(
      'id, user_id, name, starting_balance, base_currency, is_default, created_at',
    )
    .single();

  if (error) throw error;
  return data as AccountRow;
}

export async function updateAccountForUser(
  userId: string,
  id: string,
  input: UpdateAccountInput,
): Promise<AccountRow> {
  const patch: Record<string, unknown> = {};
  if (typeof input.name === 'string') patch.name = input.name;
  if (typeof input.starting_balance === 'number')
    patch.starting_balance = input.starting_balance;
  if (input.base_currency !== undefined)
    patch.base_currency = input.base_currency;

  if (Object.keys(patch).length === 0) {
    throw new Error('Nothing to update');
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select(
      'id, user_id, name, starting_balance, base_currency, is_default, created_at',
    )
    .single();

  if (error) throw error;
  return data as AccountRow;
}

export async function setDefaultAccount(
  _userId: string,
  accountId: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_default_account', {
    p_account_id: accountId,
  });
  if (error) throw error;
}

export async function deleteAccount(
  _userId: string,
  accountId: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_account', {
    p_account_id: accountId,
  });
  if (error) throw error;
}