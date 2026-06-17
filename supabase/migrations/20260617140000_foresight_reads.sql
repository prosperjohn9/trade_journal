-- Foresight log: every entry read is saved so the trader can review it, and so
-- the worker can later close the loop (fill outcome/closed_pnl when the trade
-- closes) and we can show hit-rate by flag. Owner-only RLS; all writes are by
-- the owner (analyze route) or the service role (worker).

create table if not exists public.foresight_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  position_id text,
  symbol text,
  side text,
  entry numeric,
  stop_loss numeric,
  take_profit numeric,
  volume numeric,
  warnings integer not null default 0,
  cautions integer not null default 0,
  tldr text,
  summary text,
  signals jsonb,
  outcome text,
  closed_pnl numeric,
  created_at timestamptz not null default now()
);

alter table public.foresight_reads enable row level security;

create policy "foresight_reads owner" on public.foresight_reads
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists foresight_reads_user_created_idx
  on public.foresight_reads (user_id, created_at desc);
create index if not exists foresight_reads_position_idx
  on public.foresight_reads (position_id);
