-- Per-user throttle marker for the cTrader auto-sync cron. cTrader sync is free
-- (no per-account fee), but we still want at most ~one auto-sync per user per day
-- and a backoff so a failing/hung sync doesn't get retried every tick. The cron
-- stamps this at the start of each attempt; due = null or older than the window.

alter table public.ctrader_oauth
  add column if not exists last_synced_at timestamptz;
