-- Broker refresh log: one row per account sync (manual or auto). Powers the
-- per-tier monthly manual-refresh cap and gives an audit trail of MetaApi
-- deploys for cost tracking.

create table if not exists public.mt_refreshes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.mt_connections(id) on delete set null,
  kind text not null default 'manual' check (kind in ('manual', 'auto')),
  created_at timestamptz not null default now()
);

alter table public.mt_refreshes enable row level security;

create index if not exists mt_refreshes_user_created_idx
  on public.mt_refreshes (user_id, kind, created_at desc);

-- Owner reads their own refresh history.
create policy "mt_refreshes_select_own"
  on public.mt_refreshes for select
  using (auth.uid() = user_id);

-- Owner logs their own manual refreshes; auto refreshes are inserted by the
-- service-role cron, which bypasses RLS.
create policy "mt_refreshes_insert_own"
  on public.mt_refreshes for insert
  with check (auth.uid() = user_id);
