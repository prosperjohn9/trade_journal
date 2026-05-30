-- Security hardening + one performance fix surfaced by the Supabase advisors.
--
-- 1) delete_my_account() was reachable by the `anon` role. It already no-ops
--    safely for anonymous callers (auth.uid() is NULL -> raises), so there was
--    no actual data-loss path, but least-privilege says an unauthenticated
--    role should not even be able to reach an account-deletion RPC. Revoke it.
--
-- 2) trade_groups.user_id is a foreign key with no covering index. Add one so
--    cascade deletes and user-scoped lookups stay fast as the table grows.

REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM anon;

CREATE INDEX IF NOT EXISTS trade_groups_user_id_idx
  ON public.trade_groups (user_id);
