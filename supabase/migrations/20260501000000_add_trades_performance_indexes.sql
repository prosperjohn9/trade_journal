-- Indexes to speed up the most common trade queries.
--
-- All three query patterns filter by user_id or account_id with an
-- opened_at range/comparison, so composite indexes on those pairs
-- let Postgres seek directly to matching rows instead of scanning
-- the whole table.

-- Covers: fetchTradesForMonth, fetchTradesBeforeMonth
--   WHERE user_id = ? AND opened_at >= ? (AND opened_at < ?)
CREATE INDEX IF NOT EXISTS trades_user_opened_idx
  ON trades (user_id, opened_at DESC);

-- Covers: fetchCumulativePnlBeforeDate
--   WHERE account_id = ? AND opened_at < ?
CREATE INDEX IF NOT EXISTS trades_account_opened_idx
  ON trades (account_id, opened_at DESC);

-- Covers: checklist score lookups
--   WHERE trade_id IN (...)
CREATE INDEX IF NOT EXISTS trade_criteria_checks_trade_idx
  ON trade_criteria_checks (trade_id);
