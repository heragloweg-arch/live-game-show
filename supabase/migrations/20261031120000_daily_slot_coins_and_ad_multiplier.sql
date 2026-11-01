-- 50 coins per correct daily slot; 0 on wrong; ad claim x2/x3 after 2 ads

CREATE OR REPLACE FUNCTION public.complete_daily_pack_slot_atomic(
  p_user_id UUID, p_pack_id UUID, p_slot_id UUID, p_outcome TEXT, p_points INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_pack public.daily_packs%ROWTYPE;
  v_slot public.daily_pack_slots%ROWTYPE;
  v_challenge public.challenges%ROWTYPE;
  v_inserted UUID;
  v_count INT;
  v_correct_count INT;
  v_slot_coins INT := 0;
  v_slot_xp INT := 0;
  v_balance INT;
BEGIN
  IF p_user_id IS NULL OR p_pack_id IS NULL OR p_slot_id IS NULL THEN RAISE EXCEPTION 'INVALID_DAILY_PACK_ARGUMENT'; END IF;
  IF p_outcome NOT IN ('correct', 'wrong', 'timeout', 'invalid') THEN RAISE EXCEPTION 'INVALID_DAILY_PACK_OUTCOME'; END IF;
  IF COALESCE(p_points, -1) < 0 OR p_points > 10000 THEN RAISE EXCEPTION 'INVALID_DAILY_PACK_POINTS'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha:daily-pack:' || p_user_id::text || ':' || p_pack_id::text, 0));

  SELECT * INTO v_pack FROM public.daily_packs WHERE id=p_pack_id AND active=true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_PACK_NOT_FOUND'; END IF;

  SELECT * INTO v_slot FROM public.daily_pack_slots WHERE id=p_slot_id AND pack_id=p_pack_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_PACK_SLOT_MISMATCH'; END IF;

  SELECT * INTO v_challenge FROM public.challenges
  WHERE id=v_slot.challenge_id AND active=true AND qa_status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_PACK_CHALLENGE_NOT_APPROVED'; END IF;

  INSERT INTO public.daily_pack_completions(user_id,pack_id,slot_id,outcome,points)
  VALUES(p_user_id,p_pack_id,p_slot_id,p_outcome::public.answer_outcome,p_points)
  ON CONFLICT(user_id,slot_id) DO NOTHING RETURNING id INTO v_inserted;
  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('ok',true,'alreadyCompleted',true,'coinGain',0,'xpGain',0);
  END IF;

  IF p_outcome = 'correct' THEN
    v_slot_coins := COALESCE(NULLIF(v_slot.bonus_coins, 0), 50);
    v_slot_xp := COALESCE(NULLIF(v_slot.bonus_xp, 0), 20);
    UPDATE public.profiles
      SET coins = COALESCE(coins,0) + v_slot_coins,
          xp = COALESCE(xp,0) + v_slot_xp,
          updated_at = now()
      WHERE id = p_user_id
      RETURNING coins INTO v_balance;
    INSERT INTO public.wallet_ledger(user_id, amount, type, reference_id, balance_after)
    VALUES (p_user_id, v_slot_coins, 'daily_slot_correct', p_slot_id::text, v_balance);
  END IF;

  SELECT count(*) INTO v_count FROM public.daily_pack_completions
  WHERE user_id=p_user_id AND pack_id=p_pack_id;
  SELECT count(*) INTO v_correct_count FROM public.daily_pack_completions
  WHERE user_id=p_user_id AND pack_id=p_pack_id AND outcome = 'correct';

  RETURN jsonb_build_object(
    'ok', true,
    'completed', v_count,
    'correctCount', v_correct_count,
    'packComplete', v_count >= 3,
    'coinGain', v_slot_coins,
    'xpGain', v_slot_xp,
    'perfectPack', v_count >= 3 AND v_correct_count >= 3
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_daily_pack_slot_atomic(UUID,UUID,UUID,TEXT,INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_pack_slot_atomic(UUID,UUID,UUID,TEXT,INT) TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_pack_ad_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES public.daily_packs(id) ON DELETE CASCADE,
  ads_watched INT NOT NULL DEFAULT 0,
  multiplier INT NOT NULL DEFAULT 1,
  coins_awarded INT NOT NULL DEFAULT 0,
  perfect BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pack_id)
);
ALTER TABLE public.daily_pack_ad_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_daily_pack_ad_reward_atomic(
  p_user_id UUID,
  p_pack_id UUID,
  p_ads_watched INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_count INT;
  v_correct INT;
  v_perfect BOOLEAN;
  v_mult INT;
  v_base INT := 50;
  v_award INT;
  v_balance INT;
  v_existing public.daily_pack_ad_claims%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_pack_id IS NULL THEN RAISE EXCEPTION 'INVALID_AD_CLAIM'; END IF;
  IF COALESCE(p_ads_watched, 0) < 2 THEN RAISE EXCEPTION 'ADS_REQUIRED'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha:daily-ad:' || p_user_id::text || ':' || p_pack_id::text, 0));

  SELECT count(*) INTO v_count FROM public.daily_pack_completions WHERE user_id=p_user_id AND pack_id=p_pack_id;
  IF v_count < 3 THEN RAISE EXCEPTION 'PACK_INCOMPLETE'; END IF;
  SELECT count(*) INTO v_correct FROM public.daily_pack_completions WHERE user_id=p_user_id AND pack_id=p_pack_id AND outcome='correct';
  v_perfect := v_correct >= 3;
  v_mult := CASE WHEN v_perfect THEN 3 ELSE 2 END;
  v_award := v_base * v_mult;

  SELECT * INTO v_existing FROM public.daily_pack_ad_claims WHERE user_id=p_user_id AND pack_id=p_pack_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'alreadyClaimed', true, 'coinGain', 0, 'multiplier', v_existing.multiplier);
  END IF;

  UPDATE public.profiles SET coins = COALESCE(coins,0)+v_award, updated_at=now()
  WHERE id=p_user_id RETURNING coins INTO v_balance;
  INSERT INTO public.wallet_ledger(user_id, amount, type, reference_id, balance_after)
  VALUES (p_user_id, v_award, 'daily_pack_ad_bonus', p_pack_id::text, v_balance);
  INSERT INTO public.daily_pack_ad_claims(user_id, pack_id, ads_watched, multiplier, coins_awarded, perfect)
  VALUES (p_user_id, p_pack_id, p_ads_watched, v_mult, v_award, v_perfect);

  RETURN jsonb_build_object(
    'ok', true,
    'coinGain', v_award,
    'multiplier', v_mult,
    'perfect', v_perfect,
    'baseCoins', v_base
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_daily_pack_ad_reward_atomic(UUID,UUID,INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_pack_ad_reward_atomic(UUID,UUID,INT) TO service_role;
