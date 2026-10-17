-- Rewarded-ad rewards are pending until a signed AdMob SSV callback is verified.
CREATE TABLE IF NOT EXISTS public.ad_reward_pending (
  request_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  placement TEXT NOT NULL CHECK (placement = 'rewarded_extra_coins'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  transaction_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '20 minutes'),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ad_reward_pending_user_created
  ON public.ad_reward_pending(user_id, created_at DESC);

ALTER TABLE public.ad_reward_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_reward_pending FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_ad_reward_ssv_atomic(
  p_user_id UUID,
  p_request_id UUID,
  p_placement TEXT DEFAULT 'rewarded_extra_coins',
  p_daily_cap INT DEFAULT 12
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_today_start TIMESTAMPTZ := (now() AT TIME ZONE 'Asia/Riyadh')::date AT TIME ZONE 'Asia/Riyadh';
  v_claimed INT;
  v_pending INT;
BEGIN
  IF p_request_id IS NULL OR p_placement <> 'rewarded_extra_coins' OR p_daily_cap < 1 OR p_daily_cap > 12 THEN
    RAISE EXCEPTION 'Invalid rewarded-ad request';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  UPDATE public.ad_reward_pending
    SET status = 'expired'
    WHERE user_id = p_user_id AND status = 'pending' AND expires_at <= now();

  SELECT count(*) INTO v_claimed
    FROM public.ad_reward_claims
    WHERE user_id = p_user_id AND created_at >= v_today_start;
  SELECT count(*) INTO v_pending
    FROM public.ad_reward_pending
    WHERE user_id = p_user_id AND status = 'pending' AND created_at >= v_today_start AND expires_at > now();

  IF v_claimed + v_pending >= p_daily_cap THEN
    RAISE EXCEPTION 'Daily ad reward limit';
  END IF;

  INSERT INTO public.ad_reward_pending(request_id, user_id, placement)
    VALUES (p_request_id, p_user_id, p_placement);
  RETURN jsonb_build_object('requestId', p_request_id, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_ad_reward_ssv_atomic(UUID, UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_ad_reward_ssv_atomic(UUID, UUID, TEXT, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_ad_reward_ssv_atomic(
  p_request_id UUID,
  p_transaction_id TEXT,
  p_coins INT DEFAULT 20
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_pending public.ad_reward_pending%ROWTYPE;
  v_balance INT;
BEGIN
  IF p_request_id IS NULL OR p_transaction_id IS NULL OR length(p_transaction_id) < 1 OR p_coins <> 20 THEN
    RAISE EXCEPTION 'Invalid verified reward';
  END IF;

  SELECT * INTO v_pending
    FROM public.ad_reward_pending
    WHERE request_id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reward request not found';
  END IF;
  IF v_pending.status = 'completed' THEN
    IF v_pending.transaction_id = p_transaction_id THEN
      SELECT coins INTO v_balance FROM public.profiles WHERE id = v_pending.user_id;
      RETURN jsonb_build_object('ok', true, 'already', true, 'coins', COALESCE(v_balance, 0));
    END IF;
    RAISE EXCEPTION 'Reward request already completed';
  END IF;
  IF v_pending.status <> 'pending' OR v_pending.expires_at <= now() THEN
    UPDATE public.ad_reward_pending SET status = 'expired' WHERE request_id = p_request_id;
    RETURN jsonb_build_object('ok', false, 'expired', true);
  END IF;

  v_balance := public.credit_coins(v_pending.user_id, p_coins, 'ad_reward', p_transaction_id);
  INSERT INTO public.ad_reward_claims(user_id, placement, request_id, coins_awarded)
    VALUES (v_pending.user_id, v_pending.placement, p_request_id::text, p_coins);
  UPDATE public.ad_reward_pending
    SET status = 'completed', transaction_id = p_transaction_id, completed_at = now()
    WHERE request_id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'coins', v_balance, 'awarded', p_coins);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ad_reward_ssv_atomic(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ad_reward_ssv_atomic(UUID, TEXT, INT) TO service_role;
