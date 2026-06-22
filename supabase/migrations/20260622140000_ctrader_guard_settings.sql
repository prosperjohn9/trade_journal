-- Per-account Foresight read context for cTrader, mirroring mt_connections. The
-- worker reads these so its auto-fired reads use the trader's real analysis /
-- execution timeframe and tagged setup instead of the 1H/4H day-trader default.

alter table public.ctrader_connections
  add column if not exists guard_analyzed_tf text,
  add column if not exists guard_executed_tf text,
  add column if not exists guard_setup_id uuid;
