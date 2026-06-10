-- Prop career ledger: the money side of prop trading that broker data never
-- shows — challenge fees paid, payouts received, fee refunds. Standalone from
-- accounts (account_id optional, survives account deletion) so the career ROI
-- ("am I actually up across all my prop attempts?") stays intact.

create table if not exists public.prop_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  kind text not null check (kind in ('challenge_fee', 'payout', 'refund')),
  amount numeric not null check (amount > 0),
  currency text not null default 'USD',
  firm text,
  note text,
  occurred_at date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.prop_ledger enable row level security;

create index if not exists prop_ledger_user_occurred_idx
  on public.prop_ledger (user_id, occurred_at desc);
create index if not exists prop_ledger_account_id_idx
  on public.prop_ledger (account_id);

create policy "prop_ledger_select_own" on public.prop_ledger
  for select using ((select auth.uid()) = user_id);
create policy "prop_ledger_insert_own" on public.prop_ledger
  for insert with check ((select auth.uid()) = user_id);
create policy "prop_ledger_update_own" on public.prop_ledger
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "prop_ledger_delete_own" on public.prop_ledger
  for delete using ((select auth.uid()) = user_id);
