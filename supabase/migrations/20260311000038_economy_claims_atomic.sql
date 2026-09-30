-- Economy P0: server-authoritative ad claims and subscription daily grants.
CREATE TABLE IF NOT EXISTS public.subscription_daily_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  grant_date DATE NOT NULL,
  plan TEXT NOT NULL,
  coins_awarded INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, grant_date)
);
ALTER TABLE public.subscription_daily_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_daily_grants_select ON public.subscription_daily_grants;
CREATE POLICY subscription_daily_grants_select ON public.subscription_daily_grants FOR SELECT USING (auth.uid() = user_id);
REVOKE ALL ON public.subscription_daily_grants FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_ad_claims_user_created ON public.ad_reward_claims(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.claim_ad_reward_atomic(
  p_user_id UUID,
  p_request_id TEXT,
  p_placement TEXT,
  p_coins INT DEFAULT 20,
  p_daily_cap INT DEFAULT 12
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.ad_reward_claims;
  v_count INT;
  v_balance INT;
BEGIN
  IF p_request_id IS NULL OR length(trim(p_request_id)) < 8 THEN
    RAISE EXCEPTION 'request_id required';
  END IF;
  SELECT * INTO v_existing FROM public.ad_reward_claims
    WHERE user_id = p_user_id AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    SELECT coins INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN jsonb_build_object('coins', COALESCE(v_balance, 0), 'awarded', 0, 'already', true);
  END IF;
  SELECT count(*) INTO v_count FROM public.ad_reward_claims
    WHERE user_id = p_user_id
      AND created_at >= ((now() AT TIME ZONE 'Asia/Riyadh')::date AT TIME ZONE 'Asia/Riyadh');
  IF v_count >= p_daily_cap THEN RAISE EXCEPTION 'Daily ad reward limit'; END IF;
  v_balance := public.credit_coins(p_user_id, p_coins, 'ad_reward', p_request_id);
  INSERT INTO public.ad_reward_claims(user_id, placement, request_id, coins_awarded)
    VALUES (p_user_id, COALESCE(NULLIF(trim(p_placement), ''), 'rewarded_extra_coins'), p_request_id, p_coins);
  RETURN jsonb_build_object('coins', v_balance, 'awarded', p_coins, 'already', false);
END; $$;
REVOKE ALL ON FUNCTION public.claim_ad_reward_atomic(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ad_reward_atomic(UUID, TEXT, TEXT, INT, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_subscription_daily_atomic(
  p_user_id UUID,
  p_plan TEXT,
  p_coins INT DEFAULT 25
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_date DATE := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_balance INT;
  v_grant_id UUID;
BEGIN
  IF p_plan NOT IN ('plus_monthly', 'plus_yearly', 'host_pro') THEN
    RAISE EXCEPTION 'Plan is not eligible';
  END IF;
  INSERT INTO public.subscription_daily_grants(user_id, grant_date, plan, coins_awarded)
    VALUES (p_user_id, v_date, p_plan, p_coins)
    ON CONFLICT (user_id, grant_date) DO NOTHING
    RETURNING id INTO v_grant_id;
  IF v_grant_id IS NULL THEN
    SELECT coins INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN jsonb_build_object('coins', COALESCE(v_balance, 0), 'awarded', 0, 'already', true);
  END IF;
  v_balance := public.credit_coins(p_user_id, p_coins, 'subscription_daily', v_date::text);
  RETURN jsonb_build_object('coins', v_balance, 'awarded', p_coins, 'already', false);
END; $$;
REVOKE ALL ON FUNCTION public.claim_subscription_daily_atomic(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_subscription_daily_atomic(UUID, TEXT, INT) TO service_role;
