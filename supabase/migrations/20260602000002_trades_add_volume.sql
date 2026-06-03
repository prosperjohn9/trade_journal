-- Lot size (volume) for trades, populated by broker imports (MetaApi sync).
alter table public.trades add column if not exists volume numeric;
