-- Per-user opt-out for the daily Telegram news briefing. On by default; the cron
-- skips anyone who turns it off (toggle in Settings -> Profile).

alter table public.profiles
  add column if not exists news_briefing_enabled boolean not null default true;
