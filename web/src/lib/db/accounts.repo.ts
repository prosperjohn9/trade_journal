import { supabase } from '@/src/lib/supabase/client';

const ACCOUNT_VIEW_SELECT_COLUMNS =
  'id, user_id, name, account_type, tags, starting_balance, base_currency, is_default, created_at';

export type AccountRow = {
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

export type CreateAccountInput = {
  name: string;
  account_type: string;
  tags?: string[];
  starting_balance: number;
  base_currency: string | null;
};

export type UpdateAccountInput = {
  name?: string;
  account_type?: string;
  tags?: string[];
  starting_balance?: number;
  base_currency?: string | null;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function tagFromObject(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = ['name', 'tag', 'tag_name', 'label'];

  for (const key of keys) {
    const item = row[key];
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) return trimmed;
    }
  }

  return null;
}

function parsePgArrayLiteral(value: string): string[] {
  const raw = value.trim();
  if (!raw.startsWith('{') || !raw.endsWith('}')) return [];

  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];

  const parts = inner.match(/"([^"\\]|\\.)*"|[^,]+/g) ?? [];
  return parts
    .map((part) => part.trim())
    .map((part) =>
      part.startsWith('"') && part.endsWith('"')
        ? part.slice(1, -1).replace(/\\"/g, '"')
        : part,
    )
    .map((part) => part.trim())
    .filter(Boolean);
}

function toStringArrayOrNull(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => {
        if (typeof item === 'string') return item;
        return tagFromObject(item);
      })
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return normalized.length ? normalized : null;
  }

  if (typeof value === 'string') {
    const fromPgArray = parsePgArrayLiteral(value);
    const source = fromPgArray.length > 0 ? fromPgArray : value.split(',');

    const items = source
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length ? items : null;
  }

  const fromObject = tagFromObject(value);
  if (fromObject) return [fromObject];

  return null;
}

function hydrateAccountRow(row: Record<string, unknown>): AccountRow {
  return {
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    name: String(row.name ?? ''),
    account_type:
      typeof row.account_type === 'string' ? row.account_type : null,
    tags: toStringArrayOrNull(row.tags),
    starting_balance: Number(row.starting_balance ?? 0),
    base_currency:
      typeof row.base_currency === 'string' ? row.base_currency : null,
    is_default: Boolean(row.is_default),
    created_at: String(row.created_at ?? ''),
  };
}

function normalizeTagList(tags: string[] | null | undefined): string[] {
  return (tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .sort();
}

function areTagsEquivalent(
  actual: string[] | null | undefined,
  expected: string[] | null | undefined,
): boolean {
  const a = normalizeTagList(actual);
  const b = normalizeTagList(expected);
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

async function setAccountTags(
  accountId: string,
  tags: string[] | undefined,
): Promise<void> {
  if (tags === undefined) return;

  const { error } = await supabase.rpc('set_account_tags', {
    p_account_id: accountId,
    p_tag_names: tags,
  });
  if (error) throw error;
}

async function fetchAccountByUserAndId(
  userId: string,
  accountId: string,
): Promise<AccountRow> {
  const { data, error } = await supabase
    .from('accounts_with_tags')
    .select(ACCOUNT_VIEW_SELECT_COLUMNS)
    .eq('user_id', userId)
    .eq('id', accountId)
    .single();

  if (error) throw error;
  return hydrateAccountRow(toRecord(data));
}

export async function fetchAccountsByUser(
  userId: string,
): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from('accounts_with_tags')
    .select(ACCOUNT_VIEW_SELECT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => hydrateAccountRow(toRecord(row)));
}

export async function createAccountForUser(
  userId: string,
  input: CreateAccountInput,
): Promise<AccountRow> {
  const payload: Record<string, unknown> = {
    user_id: userId,
    name: input.name,
    account_type: input.account_type,
    starting_balance: input.starting_balance,
    base_currency: input.base_currency,
  };

  const { data, error } = await supabase
    .from('accounts')
    .insert(payload)
    .select('id')
    .single();

  if (error) throw error;

  const accountId =
    data && typeof data === 'object' && 'id' in data ? String(data.id ?? '') : '';
  if (!accountId) {
    throw new Error('Failed to create account');
  }

  await setAccountTags(accountId, input.tags ?? []);

  let row = await fetchAccountByUserAndId(userId, accountId);
  if (!areTagsEquivalent(row.tags, input.tags ?? [])) {
    await setAccountTags(accountId, input.tags ?? []);
    row = await fetchAccountByUserAndId(userId, accountId);
  }

  return row;
}

export async function updateAccountForUser(
  userId: string,
  id: string,
  input: UpdateAccountInput,
): Promise<AccountRow> {
  const patch: Record<string, unknown> = {};

  if (typeof input.name === 'string') patch.name = input.name;
  if (typeof input.account_type === 'string')
    patch.account_type = input.account_type;
  if (typeof input.starting_balance === 'number')
    patch.starting_balance = input.starting_balance;
  if (input.base_currency !== undefined)
    patch.base_currency = input.base_currency;

  const shouldUpdateAccount = Object.keys(patch).length > 0;
  const shouldUpdateTags = input.tags !== undefined;
  if (!shouldUpdateAccount && !shouldUpdateTags) {
    throw new Error('Nothing to update');
  }

  if (shouldUpdateAccount) {
    const { error } = await supabase
      .from('accounts')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  await setAccountTags(id, input.tags);

  let row = await fetchAccountByUserAndId(userId, id);
  if (input.tags !== undefined && !areTagsEquivalent(row.tags, input.tags)) {
    await setAccountTags(id, input.tags);
    row = await fetchAccountByUserAndId(userId, id);
  }

  return row;
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