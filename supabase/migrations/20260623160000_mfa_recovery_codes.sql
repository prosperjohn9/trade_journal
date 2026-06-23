-- Backup recovery codes for two-factor auth. Supabase can't mint an aal2 session
-- from a non-TOTP secret, so a recovery code can't elevate a session; instead it
-- is a break-glass to DISABLE 2FA when the authenticator is lost. The user then
-- regains access (the aal2 gate's "no verified factor" branch passes) and can
-- re-enroll. Codes are stored hashed; the table is service-role only (the API
-- generates + verifies), and is deliberately NOT under the aal2 RLS gate so
-- recovery works from an aal1 session.

create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_recovery_codes_user_idx
  on public.mfa_recovery_codes (user_id);

alter table public.mfa_recovery_codes enable row level security;
-- No user policies: only the service role (the API) touches it. RLS-enabled with
-- no policy denies authenticated/anon; the service role bypasses RLS.

-- Break-glass: delete a user's MFA factors. SECURITY DEFINER to reach the auth
-- schema; service-role only so a signed-in user can NEVER call it directly (that
-- would defeat 2FA) -- it is only invoked by the recover route after verifying a
-- valid recovery code.
create or replace function public.disable_user_mfa(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.mfa_factors where user_id = p_user_id;
$$;

revoke all on function public.disable_user_mfa(uuid) from public;
revoke execute on function public.disable_user_mfa(uuid) from anon, authenticated;
grant execute on function public.disable_user_mfa(uuid) to service_role;
