export type Profile = {
  id: string;
  display_name: string | null;
  starting_balance: number | null;
  base_currency: string | null;
  updated_at?: string | null;
};

export type UpdateProfilePatch = Partial<
  Pick<Profile, 'display_name' | 'starting_balance' | 'base_currency'>
>;