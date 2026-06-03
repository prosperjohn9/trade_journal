-- Foundation for MetaTrader auto-sync (via MetaApi). Links a user's trading
-- account to a MetaApi-provisioned MT account, and adds dedup/provenance columns
-- so re-syncs (and later file imports) never create duplicate trades.

create table if not exists public.mt_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  metaapi_account_id text not null,
  login text not null,
  server text not null,
  platform text not null default 'mt5',
  region text,
  state text not null default 'pending',          -- pending | connected | error | disconnected
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, metaapi_account_id)
);

alter table public.mt_connections enable row level security;

drop policy if exists "mt_connections owner" on public.mt_connections;
create policy "mt_connections owner" on public.mt_connections
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists mt_connections_account_idx on public.mt_connections(account_id);

-- Dedup / provenance on trades. external_id example: 'metaapi:<login>:<positionId>'.
alter table public.trades add column if not exists external_id text;
alter table public.trades add column if not exists import_source text;

create unique index if not exists trades_external_id_uniq
  on public.trades(account_id, external_id)
  where external_id is not null;
