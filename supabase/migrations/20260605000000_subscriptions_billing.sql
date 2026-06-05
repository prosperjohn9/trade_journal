-- Subscriptions and billing foundation for the 3-tier plan model
-- (Pro / Elite / Master), a card-required trial, and pay-as-you-go extra synced
-- accounts. Plan prices and limits live in code (web/src/lib/billing/plans.ts);
-- this table tracks each user's current subscription state.
--
-- Writes happen server-side via the service role (checkout + provider webhooks),
-- never from the client, so a user cannot grant themselves a plan. Owners may
-- read their own row.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  plan text not null check (plan in ('pro', 'elite', 'master')),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'yearly')),

  -- Pay-as-you-go synced accounts beyond the plan's included count.
  extra_synced_accounts integer not null default 0
    check (extra_synced_accounts >= 0),

  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,

  provider text check (provider in ('flutterwave', 'nowpayments')),
  provider_customer_id text,
  provider_subscription_id text,

  -- Founding price-lock: the {monthly, yearly} amounts captured at signup so a
  -- later catalog price change never affects an existing subscriber.
  price_lock jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_user_uniq
  on public.subscriptions(user_id);

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);
-- No insert/update/delete policy on purpose: only the service role (server-side
-- checkout + webhooks) writes here, and the service role bypasses RLS. This
-- prevents a user from editing their own plan or status.

-- Idempotent audit log of provider webhooks (dedupe by provider + event_id).
-- Service-role only: RLS enabled with no policy, so anon/authenticated cannot
-- read or write it.
create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

alter table public.billing_webhook_events enable row level security;
