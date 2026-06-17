-- Per-account Foresight (real-time guardrail) opt-in. The always-on worker
-- watches and keeps deployed ONLY connections with guard_enabled = true, so the
-- 24/7 cost is never incurred unless the user explicitly turns Foresight on for
-- that account.

alter table public.mt_connections
  add column if not exists guard_enabled boolean not null default false;
