-- Maps a checkout's tx_ref to the user + plan, so the Flutterwave webhook can
-- attribute a successful charge to a user reliably, without depending on the
-- provider echoing our meta back (its legacy webhook payload does not).
-- Service-role only: RLS on, no policy.

create table if not exists public.billing_checkouts (
  tx_ref text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('pro', 'elite', 'master')),
  cycle text not null check (cycle in ('monthly', 'yearly')),
  created_at timestamptz not null default now()
);

alter table public.billing_checkouts enable row level security;
