-- Per-account add-ons purchased on top of a base plan. v1 ships the
-- extra-MetaTrader-sync add-on ($6/account/period) as a ONE-PERIOD purchase
-- (auto_renew defaults false; recurring is a future follow-up). The webhook
-- activates a row by tx_ref and recomputes subscriptions.extra_synced_accounts
-- from the user's active add-ons.

create table if not exists public.subscription_addons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('mt_sync')),
  quantity integer not null check (quantity > 0),
  unit_price_usd numeric(10,2) not null,
  billing_cycle text not null check (billing_cycle in ('monthly','yearly')),
  auto_renew boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','active','expired','canceled')),
  provider text check (provider in ('flutterwave','nowpayments')),
  tx_ref text unique,
  provider_customer_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscription_addons enable row level security;

-- Owners can read their own add-ons (for the billing UI). All writes happen via
-- the service role in the checkout route and webhooks, which bypass RLS.
create policy "addons_select_own" on public.subscription_addons
  for select using ((select auth.uid()) = user_id);

create index if not exists subscription_addons_user_status_idx
  on public.subscription_addons (user_id, status);
create index if not exists subscription_addons_tx_ref_idx
  on public.subscription_addons (tx_ref);
