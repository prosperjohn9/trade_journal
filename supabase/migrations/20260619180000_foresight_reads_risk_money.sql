-- The dollar risk Foresight computed at entry (entry-to-stop distance valued in
-- account currency), so sync can backfill a guarded trade's risk_amount from its
-- read. Stop/target are already on foresight_reads; this adds the risk figure.

alter table public.foresight_reads
  add column if not exists risk_money numeric;
