-- Fix: switch get_cumulative_pnl_before_date from SECURITY DEFINER to
-- SECURITY INVOKER so the function runs as the calling user. This means
-- Supabase RLS on the trades table applies normally — a user can only
-- SUM their own trades, even if they pass a foreign account_id.
-- Previously SECURITY DEFINER bypassed RLS, leaking an aggregate number
-- across account boundaries.

CREATE OR REPLACE FUNCTION get_cumulative_pnl_before_date(
  p_account_id uuid,
  p_before_date timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
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
