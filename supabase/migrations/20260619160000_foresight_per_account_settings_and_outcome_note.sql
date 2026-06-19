-- Per-account Foresight context so the always-on worker reads the timeframes and
-- setup the trader actually uses (not the 1H/4H default). And a close-the-loop
-- conclusion stored on the read so both Telegram and the log show the tie-back.

alter table public.mt_connections
  add column if not exists guard_analyzed_tf text,
  add column if not exists guard_executed_tf text,
  add column if not exists guard_setup_id uuid
    references public.setup_templates(id) on delete set null;

alter table public.foresight_reads
  add column if not exists outcome_note text;
