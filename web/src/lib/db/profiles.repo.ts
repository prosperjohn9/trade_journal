import { supabase } from '@/src/lib/supabase/client';
import type { Profile, UpdateProfilePatch } from '@/src/domain/profile';
import { requireUser } from '@/src/lib/supabase/auth';

const NO_ROW_CODE = 'PGRST116';

type PostgrestLikeError = {
  code?: string;
  message?: string;
};

function getErrCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  return (err as PostgrestLikeError).code;
}

const PROFILE_SELECT =
  'id, display_name, starting_balance, base_currency, timezone, risk_per_trade_percent, rr_win, created_at';

export type UpdateProfileRepoPatch = UpdateProfilePatch & {
  timezone?: string | null;
  risk_per_trade_percent?: number | null;
  rr_win?: number | null;
};

type CreateProfileRow = {
  id: string;
  display_name: string | null;
  starting_balance: number | null;
  base_currency: string;
  timezone?: string | null;
  risk_per_trade_percent?: number | null;
  rr_win?: number | null;
};

export async function getOrCreateProfile(): Promise<{
  userId: string;
  profile: Profile;
}> {
  const user = await requireUser();

  const { data: existing, error: selErr } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', user.id)
    .single();

  if (selErr && getErrCode(selErr) === NO_ROW_CODE) {
    const insertRow: CreateProfileRow = {
      id: user.id,
      display_name: null,
      starting_balance: null,
      base_currency: 'USD',
      timezone: 'Europe/Istanbul',
      risk_per_trade_percent: 1,
      rr_win: 2,
    };

    const { data: created, error: insErr } = await supabase
      .from('profiles')
      .insert(insertRow)
      .select(PROFILE_SELECT)
      .single();

    if (insErr) throw insErr;
    return { userId: user.id, profile: created as Profile };
  }

  if (selErr) throw selErr;
  return { userId: user.id, profile: existing as Profile };
}

export async function updateProfile(
  patch: UpdateProfileRepoPatch,
): Promise<Profile> {
  const user = await requireUser();

  const update: UpdateProfileRepoPatch = {};

  if (patch.display_name !== undefined)
    update.display_name = patch.display_name;
  if (patch.starting_balance !== undefined)
    update.starting_balance = patch.starting_balance;
  if (patch.base_currency !== undefined)
    update.base_currency = patch.base_currency;
  if (patch.timezone !== undefined) update.timezone = patch.timezone;
  if (patch.risk_per_trade_percent !== undefined)
    update.risk_per_trade_percent = patch.risk_per_trade_percent;
  if (patch.rr_win !== undefined) update.rr_win = patch.rr_win;

  if (Object.keys(update).length === 0) {
    throw new Error('Nothing to update');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .select(PROFILE_SELECT)
    .single();

  if (error) throw error;
  return data as Profile;
}