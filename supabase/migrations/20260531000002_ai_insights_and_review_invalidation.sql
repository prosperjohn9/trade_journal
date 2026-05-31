-- Feature #3 (AI Insights): one cached insight per user, refreshed as they
-- trade. Plus a trigger that invalidates a trade's cached AI review when the
-- trade's data changes, so an edited trade offers a fresh review.

CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  model text NOT NULL,
  trade_count integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_insights_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_insights_select_own" ON public.ai_insights
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ai_insights_insert_own" ON public.ai_insights
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "ai_insights_update_own" ON public.ai_insights
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ai_insights_delete_own" ON public.ai_insights
  FOR DELETE USING (user_id = auth.uid());

-- Invalidate a trade's cached AI review when its data changes. Fires only on
-- data-bearing columns (NOT reviewed_at / review_notes), so the manual-review
-- flow never wipes the AI review. SECURITY DEFINER so it can delete the review
-- regardless of the editing path; it only ever targets the edited trade's id.
CREATE OR REPLACE FUNCTION public.clear_ai_review_on_trade_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.trade_ai_reviews WHERE trade_id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_ai_review_on_trade_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trade_ai_review_invalidate ON public.trades;
CREATE TRIGGER trade_ai_review_invalidate
  AFTER UPDATE OF
    instrument, direction, outcome,
    entry_price, stop_loss, take_profit, exit_price,
    pnl_amount, pnl_percent, net_pnl, risk_amount, commission,
    opened_at, closed_at, notes, emotion_tag, lesson_learned
  ON public.trades
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_ai_review_on_trade_change();
