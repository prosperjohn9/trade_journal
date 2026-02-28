export const ACCOUNT_TYPES = [
  'Live',
  'Demo',
  'Challenge',
  'Funded',
  'Investor',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type DbAccountType =
  | 'Live'
  | 'Demo'
  | 'Prop Challenge'
  | 'Prop Funded'
  | 'Investor / Managed';

export type Account = {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  tags: string[];
  starting_balance: number;
  base_currency: string | null;
  is_default: boolean;
  trade_count?: number;
  net_pnl?: number;
  created_at: string;
};

export type CreateAccountInput = {
  name: string;
  account_type: AccountType;
  tags?: string[];
  starting_balance: number;
  base_currency: string | null;
};

export type UpdateAccountInput = {
  name?: string;
  account_type?: AccountType;
  tags?: string[];
  starting_balance?: number;
  base_currency?: string | null;
};

export function isAccountType(v: unknown): v is AccountType {
  return typeof v === 'string' && ACCOUNT_TYPES.includes(v as AccountType);
}

function canonicalAccountType(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeAccountType(v: unknown): AccountType {
  if (typeof v !== 'string') return 'Live';

  const next = canonicalAccountType(v);
  if (next === 'live') return 'Live';
  if (next === 'demo') return 'Demo';
  if (next === 'challenge' || next === 'prop challenge') return 'Challenge';
  if (next === 'funded' || next === 'prop funded') return 'Funded';
  if (
    next === 'investor' ||
    next === 'investor / managed' ||
    next === 'investor/managed' ||
    next === 'personal'
  ) {
    return 'Investor';
  }

  return isAccountType(v) ? v : 'Live';
}

export function toDbAccountType(v: unknown): DbAccountType {
  const normalized = normalizeAccountType(v);
  if (normalized === 'Challenge') return 'Prop Challenge';
  if (normalized === 'Funded') return 'Prop Funded';
  if (normalized === 'Investor') return 'Investor / Managed';
  return normalized;
}

export function fromDbAccountType(v: unknown): AccountType {
  return normalizeAccountType(v);
}

export function normalizeAccountTag(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const next = v.replace(/\s+/g, ' ').trim();
  return next ? next : null;
}

export function normalizeAccountTags(v: unknown): string[] {
  const source = Array.isArray(v)
    ? v
    : typeof v === 'string'
      ? v.split(',')
      : [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of source) {
    const next = normalizeAccountTag(item);
    if (!next) continue;

    const key = next.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(next);
  }

  return out;
}

export function formatAccountTagLabel(tag: string): string {
  const value = tag.trim();
  if (!value) return '';

  if (value !== value.toLowerCase()) return value;

  return value.replace(/\b([a-z])([a-z]*)/g, (_match, first, rest) => {
    return `${first.toUpperCase()}${rest}`;
  });
}
