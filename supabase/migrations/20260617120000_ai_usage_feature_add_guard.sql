-- Live Guard logs its AI narration calls to ai_usage like any other feature.
-- Widen the feature CHECK to allow 'guard'.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature = any (array['trade_review'::text, 'insights'::text, 'chat'::text, 'guard'::text]));
