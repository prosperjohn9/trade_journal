-- Dedupe ledger for in-trade news countdown pings. The worker reports the open
-- symbols on each guarded account; the app finds an imminent high-impact event
-- and pings Telegram once per (user, pair, event occurrence, band) so the trader
-- is not spammed every poll. Bands: 'headsup' (<=45 min) and 'imminent' (<=15).

create table if not exists public.foresight_news_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  event_at timestamptz not null,
  band text not null,
  created_at timestamptz not null default now(),
  unique (user_id, symbol, event_at, band)
);

alter table public.foresight_news_alerts enable row level security;

-- Owner may read (for any future UI); all writes are service-role only.
create policy "foresight_news_alerts owner" on public.foresight_news_alerts
  for select using ((select auth.uid()) = user_id);
