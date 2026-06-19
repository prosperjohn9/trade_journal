-- Foresight guardrail as a per-account add-on ($18/MetaTrader account). Mirrors
-- the extra-sync add-on: a one-period purchase recorded in subscription_addons
-- (kind='guardrail'); the webhook activates it and recomputes a per-user seat
-- count on subscriptions.guardrail_seats. The number of MetaTrader accounts a
-- user may turn Foresight on for is capped to their paid seats.

alter table public.subscriptions
  add column if not exists guardrail_seats integer not null default 0;

alter table public.subscription_addons
  drop constraint if exists subscription_addons_kind_check;
alter table public.subscription_addons
  add constraint subscription_addons_kind_check check (kind in ('mt_sync','guardrail'));
