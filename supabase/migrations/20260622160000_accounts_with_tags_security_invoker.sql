-- Security Advisor flagged accounts_with_tags as a SECURITY DEFINER view, which
-- bypasses the querying user's RLS. The app already filters by user_id, but
-- switching the view to security_invoker makes RLS enforce per-user isolation
-- too (defense in depth, clears the advisor error). All three joined tables
-- (accounts, account_tags, tags) have owner-scoped SELECT policies, so an owner
-- still sees their own accounts + tags; service-role reads bypass RLS as before.

alter view public.accounts_with_tags set (security_invoker = on);
