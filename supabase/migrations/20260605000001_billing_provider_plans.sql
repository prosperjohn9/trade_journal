-- Maps our internal (plan, cycle) to the payment provider's recurring plan id.
-- Flutterwave payment plans are created lazily on first checkout and their ids
-- cached here so later checkouts reuse the same plan. Service-role only: RLS is
-- enabled with no policy, so users cannot read or write it.

create table if not exists public.billing_provider_plans (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'flutterwave',
  plan text not null check (plan in ('pro', 'elite', 'master')),
  cycle text not null check (cycle in ('monthly', 'yearly')),
  provider_plan_id text not null,
  amount numeric not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, plan, cycle)
);

alter table public.billing_provider_plans enable row level security;
