-- Per-account prop-firm challenge rules (JSON config). Only set for
-- challenge/funded accounts; drives the prop-firm status computation.
alter table public.accounts add column if not exists prop_rules jsonb;
