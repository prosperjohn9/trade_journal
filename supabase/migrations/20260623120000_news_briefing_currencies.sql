-- Let users explicitly choose which currencies' high-impact news they want in the
-- daily briefing, instead of always inferring from their traded pairs. When this
-- is empty/null the cron falls back to inferring from the last 60 days of trades,
-- so it still works with zero setup; a non-empty list always wins.

alter table public.profiles
  add column if not exists news_briefing_currencies text[];
