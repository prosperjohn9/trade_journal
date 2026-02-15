import { supabase } from '@/src/lib/supabaseClient';

export type Account = {
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


export async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select(
      'id, user_id, name, starting_balance, base_currency, is_default, created_at',
    )
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Account[];
}

export async function createAccount(
  input: CreateAccountInput,
): Promise<Account> {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;

  const user = auth?.user;
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      user_id: user.id,
      name: input.name,
      starting_balance: input.starting_balance,
      base_currency: input.base_currency,
    })
    .select(
      'id, user_id, name, starting_balance, base_currency, is_default, created_at',
    )
    .single();

  if (error) throw error;
  return data as Account;
}

export async function updateAccount(
  id: string,
  input: UpdateAccountInput,
): Promise<Account> {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;

  const user = auth?.user;
  if (!user) throw new Error('Not authenticated');

  const patch: Record<string, unknown> = {};
  if (typeof input.name === 'string') patch.name = input.name;
  if (typeof input.starting_balance === 'number')
    patch.starting_balance = input.starting_balance;
  if (input.base_currency !== undefined)
    patch.base_currency = input.base_currency;

  if (Object.keys(patch).length === 0) {
    throw new Error('Nothing to update');
  }

  // include user_id filter for extra safety (RLS should also enforce it)
  const { data, error } = await supabase
    .from('accounts')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select(
      'id, user_id, name, starting_balance, base_currency, is_default, created_at',
    )
    .single();

  if (error) throw error;
  return data as Account;
}

export async function setDefaultAccount(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_default_account', {
    p_account_id: id,
  });
  if (error) throw error;
}

export async function getDefaultAccountId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id')
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_account', { p_account_id: id });
  if (error) throw error;
}