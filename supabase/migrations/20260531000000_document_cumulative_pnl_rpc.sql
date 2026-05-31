-- Records get_cumulative_pnl_before_date as it currently exists in the live
-- database. The function predates main's committed migration history (the
-- migrations folder was reset in an earlier commit), but production code depends
-- on it -- web/src/app/api/trade-view/[id]/route.ts and web/src/lib/db/trades.repo.ts
-- both call it -- so it is captured here for version control.
--
-- Returns the sum of effective net P&L for all trades in an account opened
-- before a given timestamp: uses net_pnl when present, otherwise falls back to
-- pnl_amount - commission. Returns 0 when no rows match. Replaces a client-side
-- fetch-all-and-sum with a single server-side aggregation.
--
-- SECURITY INVOKER (the default) so it runs under the caller's RLS on `trades`
-- -- a user can only ever sum their own trades. search_path is pinned for
-- safety. CREATE OR REPLACE makes this idempotent and matches the live object.

CREATE OR REPLACE FUNCTION public.get_cumulative_pnl_before_date(
  p_account_id uuid,
  p_before_date timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
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
