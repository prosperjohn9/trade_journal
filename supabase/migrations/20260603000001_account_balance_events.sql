-- Deposits / withdrawals ledger. Populated automatically from broker balance
-- operations on sync (source 'metaapi') and manually by the user ('manual').
-- The earliest balance operation is the account's starting_balance (handled in
-- the sync route); everything after it lands here as a deposit/withdrawal.

create table if not exists public.account_balance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('DEPOSIT', 'WITHDRAWAL')),
  amount numeric not null check (amount >= 0),
  occurred_at timestamptz not null default now(),
  source text not null default 'manual',          -- manual | metaapi
  external_id text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.account_balance_events enable row level security;

drop policy if exists "balance_events owner" on public.account_balance_events;
create policy "balance_events owner" on public.account_balance_events
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists balance_events_account_idx
  on public.account_balance_events(account_id);

create unique index if not exists balance_events_external_uniq
  on public.account_balance_events(account_id, external_id)
  where external_id is not null;
