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