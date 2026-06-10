-- Performance pass from the Supabase advisor.
--
-- 1) RLS initplan: bare auth.uid() in a policy is re-evaluated per row; wrapping
--    it in (select auth.uid()) lets Postgres evaluate it once per query.
--    Identical semantics, faster at scale.
-- 2) Covering indexes for three unindexed foreign keys.

-- account_balance_events
alter policy "balance_events owner" on public.account_balance_events
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ai_insights
alter policy "ai_insights_delete_own" on public.ai_insights
  using (user_id = (select auth.uid()));
alter policy "ai_insights_insert_own" on public.ai_insights
  with check (user_id = (select auth.uid()));
alter policy "ai_insights_select_own" on public.ai_insights
  using (user_id = (select auth.uid()));
alter policy "ai_insights_update_own" on public.ai_insights
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ai_usage
alter policy "ai_usage_insert_own" on public.ai_usage
  with check (user_id = (select auth.uid()));
alter policy "ai_usage_select_own" on public.ai_usage
  using (user_id = (select auth.uid()));

-- mt_connections
alter policy "mt_connections owner" on public.mt_connections
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- mt_refreshes
alter policy "mt_refreshes_insert_own" on public.mt_refreshes
  with check ((select auth.uid()) = user_id);
alter policy "mt_refreshes_select_own" on public.mt_refreshes
  using ((select auth.uid()) = user_id);

-- subscriptions
alter policy "subscriptions_select_own" on public.subscriptions
  using ((select auth.uid()) = user_id);

-- trade_ai_reviews
alter policy "trade_ai_reviews_delete_own" on public.trade_ai_reviews
  using (user_id = (select auth.uid()));
alter policy "trade_ai_reviews_insert_own" on public.trade_ai_reviews
  with check (user_id = (select auth.uid()));
alter policy "trade_ai_reviews_select_own" on public.trade_ai_reviews
  using (user_id = (select auth.uid()));
alter policy "trade_ai_reviews_update_own" on public.trade_ai_reviews
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Unindexed foreign keys
create index if not exists account_balance_events_user_id_idx
  on public.account_balance_events (user_id);
create index if not exists billing_checkouts_user_id_idx
  on public.billing_checkouts (user_id);
create index if not exists mt_refreshes_connection_id_idx
  on public.mt_refreshes (connection_id);
