-- The commitment loop: rules a trader commits to after seeing a Hindsight leak.
-- Adherence and dollars-saved are computed on the fly from synced trades against
-- these rules; only the commitment itself is stored.

create table if not exists public.trading_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('revenge','oversized','session','weekday','emotion')),
  subject text, -- session name / weekday / emotion tag, for those kinds
  label text not null, -- snapshot of the rule statement at commit time
  committed_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

alter table public.trading_rules enable row level security;

create policy "rules_select_own" on public.trading_rules
  for select using ((select auth.uid()) = user_id);
create policy "rules_insert_own" on public.trading_rules
  for insert with check ((select auth.uid()) = user_id);
create policy "rules_update_own" on public.trading_rules
  for update using ((select auth.uid()) = user_id);
create policy "rules_delete_own" on public.trading_rules
  for delete using ((select auth.uid()) = user_id);

create index if not exists trading_rules_user_status_idx
  on public.trading_rules (user_id, status);
