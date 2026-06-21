-- cTrader (Spotware Open API) foundation. OAuth is user-level: one grant covers
-- all of a user's cTrader accounts, so the token lives once per user. Per-account
-- links (one cTrader trading account <-> one TH account) mirror mt_connections.

create table if not exists public.ctrader_oauth (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ctrader_oauth enable row level security;
-- Owner may see whether they are connected (RLS scopes it); all writes happen via
-- the service role.
create policy "ctrader_oauth owner" on public.ctrader_oauth
  for select using ((select auth.uid()) = user_id);

create table if not exists public.ctrader_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  ctid_trader_account_id bigint not null,
  environment text not null default 'live',   -- live | demo
  label text,
  state text not null default 'pending',       -- pending | connected | error | disconnected
  guard_enabled boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ctid_trader_account_id)
);
alter table public.ctrader_connections enable row level security;
create policy "ctrader_connections owner" on public.ctrader_connections
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists ctrader_connections_user_idx
  on public.ctrader_connections (user_id);

-- OAuth CSRF state, mirrors the telegram link-code pattern on profiles.
alter table public.profiles
  add column if not exists ctrader_oauth_state text,
  add column if not exists ctrader_oauth_expires timestamptz;
