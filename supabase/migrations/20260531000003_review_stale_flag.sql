-- Refine review invalidation: instead of DELETING a trade's cached AI review
-- when the trade changes, KEEP it and mark it stale. The UI then keeps showing
-- the review with a contextual "Regenerate" option, so a cosmetic edit never
-- forces a paid regeneration or loses the existing review.

ALTER TABLE public.trade_ai_reviews
  ADD COLUMN IF NOT EXISTS stale boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.mark_ai_review_stale_on_trade_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trade_ai_reviews SET stale = true WHERE trade_id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_ai_review_stale_on_trade_change() FROM PUBLIC;

-- Repoint the trigger from the old delete-based function to the new one.
DROP TRIGGER IF EXISTS trade_ai_review_invalidate ON public.trades;
CREATE TRIGGER trade_ai_review_invalidate
  AFTER UPDATE OF
    instrument, direction, outcome,
    entry_price, stop_loss, take_profit, exit_price,
    pnl_amount, pnl_percent, net_pnl, risk_amount, commission,
    opened_at, closed_at, notes, emotion_tag, lesson_learned
  ON public.trades
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_ai_review_stale_on_trade_change();

DROP FUNCTION IF EXISTS public.clear_ai_review_on_trade_change();
