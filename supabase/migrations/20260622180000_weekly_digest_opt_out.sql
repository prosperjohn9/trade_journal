-- Per-user opt-out for the weekly Hindsight digest (email + Telegram). On by
-- default; the digest cron skips anyone who turns it off, and the email footer
-- links to Settings to toggle it.

alter table public.profiles
  add column if not exists weekly_digest_enabled boolean not null default true;
