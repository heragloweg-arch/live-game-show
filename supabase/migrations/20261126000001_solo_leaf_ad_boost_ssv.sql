-- Secure two-ad boost for a completed Challenge Tree leaf.
-- The client may request the flow, but only a verified AdMob SSV callback can complete it.
BEGIN;

ALTER TABLE public.ad_reward_pending
  ADD COLUMN IF NOT EXISTS boost_group_id UUID,
  ADD COLUMN IF NOT EXISTS boost_slot INT,
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journey_branch INT,
  ADD COLUMN IF NOT EXISTS journey_leaf INT;

CREATE INDEX IF NOT EXISTS idx_ad_reward_pending_boost_group
  ON public.ad_reward_pending(boost_group_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_reward_pending_boost_slot
  ON public.ad_reward_pending(boost_group_id, boost_slot)
  WHERE boost_group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.solo_leaf_ad_boosts (
  boost_group_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  journey_branch INT NOT NULL CHECK (journey_branch BETWEEN 1 AND 6),
  journey_leaf INT NOT NULL CHECK (journey_leaf BETWEEN 1 AND 8),
  ads_verified INT NOT NULL DEFAULT 0 CHECK (ads_verified BETWEEN 0 AND 2),
  bonus_awarded INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.solo_leaf_ad_boosts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solo_leaf_ad_boosts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.solo_leaf_ad_boosts TO service_role;

-- New overload; the old four-argument function remains for backwards compatibility.
CREATE OR REPLACE FUNCTION public.prepare_ad_reward_ssv_atomic(
  p_user_id UUID,
  p_request_id UUID,
  p_placement TEXT,
  p_daily_cap INT,
  p_boost_group_id UUID,
  p_boost_slot INT,
  p_match_id UUID,
  p_journey_branch INT,
  p_journey_leaf INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_today_start TIMESTAMPTZ := (now() AT TIME ZONE 'Asia/Riyadh')::date AT TIME ZONE 'Asia/Riyadh';
  v_claimed INT;
  v_pending INT;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_placement <> 'rewarded_extra_coins'
     OR p_daily_cap < 1 OR p_daily_cap > 12 THEN
    RAISE EXCEPTION 'Invalid rewarded-ad request';
  END IF;
  IF (p_boost_group_id IS NULL) <> (p_match_id IS NULL)
     OR (p_boost_group_id IS NULL) <> (p_journey_branch IS NULL)
     OR (p_boost_group_id IS NULL) <> (p_journey_leaf IS NULL)
     OR (p_boost_group_id IS NULL) <> (p_boost_slot IS NULL) THEN
    RAISE EXCEPTION 'Invalid boost context';
  END IF;
  IF p_boost_group_id IS NOT NULL AND (p_boost_slot NOT IN (1, 2) OR p_journey_branch NOT BETWEEN 1 AND 6 OR p_journey_leaf NOT BETWEEN 1 AND 8) THEN
    RAISE EXCEPTION 'Invalid boost context';
  END IF;
  IF p_boost_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.matches m
    JOIN public.match_participants mp ON mp.match_id = m.id AND mp.user_id = p_user_id
    WHERE m.id = p_match_id
      AND m.mode = 'solo'
      AND m.status IN ('MATCH_FINISHED', 'FINAL_RESULT')
      AND (m.config_snapshot->>'journeyBranch')::int = p_journey_branch
      AND (m.config_snapshot->>'journeyLeaf')::int = p_journey_leaf
  ) THEN
    RAISE EXCEPTION 'Invalid completed challenge leaf';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  UPDATE public.ad_reward_pending SET status = 'expired'
    WHERE user_id = p_user_id AND status = 'pending' AND expires_at <= now();
  SELECT count(*) INTO v_claimed FROM public.ad_reward_claims
    WHERE user_id = p_user_id AND created_at >= v_today_start;
  SELECT count(*) INTO v_pending FROM public.ad_reward_pending
    WHERE user_id = p_user_id AND status = 'pending' AND created_at >= v_today_start AND expires_at > now();
  IF v_claimed + v_pending >= p_daily_cap THEN RAISE EXCEPTION 'Daily ad reward limit'; END IF;
  IF p_boost_group_id IS NOT NULL THEN
    INSERT INTO public.solo_leaf_ad_boosts(boost_group_id, user_id, match_id, journey_branch, journey_leaf)
    VALUES (p_boost_group_id, p_user_id, p_match_id, p_journey_branch, p_journey_leaf)
    ON CONFLICT (boost_group_id) DO UPDATE SET user_id = EXCLUDED.user_id;
  END IF;
  INSERT INTO public.ad_reward_pending(request_id, user_id, placement, boost_group_id, boost_slot, match_id, journey_branch, journey_leaf)
    VALUES (p_request_id, p_user_id, p_placement, p_boost_group_id, p_boost_slot, p_match_id, p_journey_branch, p_journey_leaf);
  RETURN jsonb_build_object('requestId', p_request_id, 'status', 'pending');
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_ad_reward_ssv_atomic(UUID, UUID, TEXT, INT, UUID, INT, UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_ad_reward_ssv_atomic(UUID, UUID, TEXT, INT, UUID, INT, UUID, INT, INT) TO service_role;

-- Replace completion with a version that awards the verified ad and, on the second
-- verified ad in the same group, awards exactly one server-side leaf boost.
CREATE OR REPLACE FUNCTION public.complete_ad_reward_ssv_atomic(
  p_request_id UUID, p_transaction_id TEXT, p_coins INT DEFAULT 20
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_pending public.ad_reward_pending%ROWTYPE;
  v_balance INT;
  v_verified INT;
  v_bonus INT := 0;
BEGIN
  IF p_request_id IS NULL OR p_transaction_id IS NULL OR length(p_transaction_id) < 1 OR p_coins <> 20 THEN RAISE EXCEPTION 'Invalid verified reward'; END IF;
  SELECT * INTO v_pending FROM public.ad_reward_pending WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward request not found'; END IF;
  IF v_pending.status = 'completed' THEN
    SELECT coins INTO v_balance FROM public.profiles WHERE id = v_pending.user_id;
    RETURN jsonb_build_object('ok', true, 'already', true, 'coins', COALESCE(v_balance, 0));
  END IF;
  IF v_pending.status <> 'pending' OR v_pending.expires_at <= now() THEN
    UPDATE public.ad_reward_pending SET status = 'expired' WHERE request_id = p_request_id;
    RETURN jsonb_build_object('ok', false, 'expired', true);
  END IF;
  v_balance := public.credit_coins(v_pending.user_id, p_coins, 'ad_reward', p_transaction_id);
  INSERT INTO public.ad_reward_claims(user_id, placement, request_id, coins_awarded)
    VALUES (v_pending.user_id, v_pending.placement, p_request_id::text, p_coins);
  UPDATE public.ad_reward_pending SET status = 'completed', transaction_id = p_transaction_id, completed_at = now()
    WHERE request_id = p_request_id;
  IF v_pending.boost_group_id IS NOT NULL THEN
    SELECT count(*) INTO v_verified FROM public.ad_reward_pending
      WHERE boost_group_id = v_pending.boost_group_id AND status = 'completed';
    UPDATE public.solo_leaf_ad_boosts
      SET ads_verified = LEAST(v_verified, 2)
      WHERE boost_group_id = v_pending.boost_group_id AND ads_verified < LEAST(v_verified, 2);
    IF v_verified >= 2 THEN
      UPDATE public.solo_leaf_ad_boosts SET bonus_awarded = 100, completed_at = COALESCE(completed_at, now())
        WHERE boost_group_id = v_pending.boost_group_id AND bonus_awarded = 0;
      IF FOUND THEN
        v_balance := public.credit_coins(v_pending.user_id, 100, 'solo_leaf_ad_boost', v_pending.boost_group_id::text);
        v_bonus := 100;
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'already', false, 'coins', v_balance, 'awarded', p_coins, 'boostBonus', v_bonus);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_ad_reward_ssv_atomic(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ad_reward_ssv_atomic(UUID, TEXT, INT) TO service_role;
COMMIT;
