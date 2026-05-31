-- AI feature tables: cached per-trade reviews + a per-call usage log (drives
-- per-user rate limiting and gives cost visibility). Both are owner-scoped under
-- RLS; the AI route handlers write them under the caller's JWT, so user_id is
-- always set to the authenticated user.

-- 1) Cached per-trade AI reviews. One row per trade (regenerating overwrites it),
--    so re-opening a reviewed trade costs nothing.
CREATE TABLE IF NOT EXISTS public.trade_ai_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trade_ai_reviews_trade_id_key UNIQUE (trade_id)
);

CREATE INDEX IF NOT EXISTS trade_ai_reviews_user_id_idx
  ON public.trade_ai_reviews (user_id);

ALTER TABLE public.trade_ai_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trade_ai_reviews_select_own" ON public.trade_ai_reviews
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "trade_ai_reviews_insert_own" ON public.trade_ai_reviews
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "trade_ai_reviews_update_own" ON public.trade_ai_reviews
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "trade_ai_reviews_delete_own" ON public.trade_ai_reviews
  FOR DELETE USING (user_id = auth.uid());

-- 2) Per-call usage log. Counted over a rolling 24h window to rate-limit each
--    user, and useful for seeing where credits go. Insert-only for clients
--    (no update/delete policy); never exposes other users' rows.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('trade_review', 'insights', 'chat')),
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx
  ON public.ai_usage (user_id, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_select_own" ON public.ai_usage
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ai_usage_insert_own" ON public.ai_usage
  FOR INSERT WITH CHECK (user_id = auth.uid());
