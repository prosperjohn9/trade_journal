-- Returns the sum of effective net P&L for all trades in an account
-- opened before a given timestamp. Uses net_pnl when stored, otherwise
-- falls back to pnl_amount - commission. Returns 0 when no rows match.
--
-- Replaces a client-side fetch-all-and-sum pattern with a single
-- server-side aggregation that returns one number over the wire.

CREATE OR REPLACE FUNCTION get_cumulative_pnl_before_date(
  p_account_id uuid,
  p_before_date timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN net_pnl IS NOT NULL THEN net_pnl
        ELSE COALESCE(pnl_amount, 0) - COALESCE(commission, 0)
      END
    ),
    0
  )
  FROM trades
  WHERE account_id = p_account_id
    AND opened_at < p_before_date;
$$;
