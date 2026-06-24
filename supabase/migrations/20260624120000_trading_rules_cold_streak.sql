-- Allow the new 'cold_streak' commitment rule (stop after 2 losses in a row),
-- matching the new Hindsight tilt-streak leak.
alter table public.trading_rules
  drop constraint if exists trading_rules_kind_check;

alter table public.trading_rules
  add constraint trading_rules_kind_check
  check (kind in ('revenge', 'oversized', 'session', 'weekday', 'emotion', 'cold_streak'));
