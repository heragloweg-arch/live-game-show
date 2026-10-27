-- P0: validate Daily challenge/pack contracts inside SQL and keep reward ledger atomic.
BEGIN;

CREATE OR REPLACE FUNCTION public.complete_daily_atomic(
  p_user_id UUID, p_day DATE, p_challenge_id UUID, p_outcome TEXT,
  p_points INT, p_bonus_coins INT, p_bonus_xp INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_existing UUID;
  v_daily public.daily_challenges%ROWTYPE;
  v_challenge public.challenges%ROWTYPE;
  v_coins INT;
  v_mult INT := 1;
  v_plan TEXT;
  v_exp TIMESTAMPTZ;
  v_award INT;
  v_xp_award INT;
  v_streak INT := 1;
  v_prev DATE;
  v_best INT := 1;
BEGIN
  IF p_user_id IS NULL OR p_day IS NULL OR p_challenge_id IS NULL THEN RAISE EXCEPTION 'INVALID_DAILY_ARGUMENT'; END IF;
  IF p_outcome NOT IN ('correct', 'wrong', 'timeout', 'invalid') THEN RAISE EXCEPTION 'INVALID_DAILY_OUTCOME'; END IF;
  IF COALESCE(p_points, -1) < 0 OR p_points > 10000 THEN RAISE EXCEPTION 'INVALID_DAILY_POINTS'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha:daily:' || p_user_id::text, 0));

  SELECT * INTO v_daily FROM public.daily_challenges
  WHERE challenge_date = p_day AND challenge_id = p_challenge_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_CHALLENGE_MISMATCH'; END IF;

  SELECT * INTO v_challenge FROM public.challenges
  WHERE id = p_challenge_id AND active = true AND qa_status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_CHALLENGE_NOT_APPROVED'; END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id = v_challenge.id)
    OR EXISTS (
      SELECT 1 FROM public.challenge_choices cc WHERE cc.challenge_id = v_challenge.id
      GROUP BY cc.challenge_id HAVING count(*) >= 2 AND bool_or(cc.is_correct = true)
    )
    OR (v_challenge.letter_pool IS NOT NULL AND cardinality(v_challenge.letter_pool) > 0
        AND v_challenge.max_length IS NOT NULL
        AND v_challenge.max_length BETWEEN 1 AND cardinality(v_challenge.letter_pool))
  ) THEN RAISE EXCEPTION 'DAILY_CHALLENGE_NOT_PLAYABLE'; END IF;

  SELECT id INTO v_existing FROM public.daily_completions
  WHERE user_id = p_user_id AND challenge_date = p_day;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  SELECT subscription_plan, subscription_expires_at INTO v_plan, v_exp
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF v_plan IN ('plus_monthly', 'plus_yearly', 'host_pro')
     AND (v_exp IS NULL OR v_exp > now()) THEN v_mult := 2; END IF;

  v_award := CASE WHEN p_outcome = 'correct' THEN GREATEST(0, v_daily.bonus_coins) * v_mult ELSE 0 END;
  v_xp_award := CASE WHEN p_outcome = 'correct' THEN GREATEST(0, v_daily.bonus_xp) * v_mult ELSE 0 END;

  INSERT INTO public.daily_completions(user_id, challenge_date, outcome, points)
  VALUES (p_user_id, p_day, p_outcome::public.answer_outcome, p_points)
  ON CONFLICT (user_id, challenge_date) DO NOTHING
  RETURNING id INTO v_existing;
  IF v_existing IS NULL THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  SELECT current_streak, last_daily_date, longest_streak
  INTO v_streak, v_prev, v_best
  FROM public.user_streaks WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_streaks(user_id, current_streak, longest_streak, last_daily_date)
    VALUES (p_user_id, 1, 1, p_day);
    v_streak := 1;
  ELSE
    IF v_prev = p_day - 1 THEN v_streak := COALESCE(v_streak, 0) + 1;
    ELSIF v_prev = p_day THEN v_streak := COALESCE(v_streak, 1);
    ELSE v_streak := 1;
    END IF;
    v_best := GREATEST(COALESCE(v_best, 0), v_streak);
    UPDATE public.user_streaks SET current_streak=v_streak,longest_streak=v_best,last_daily_date=p_day,updated_at=now()
    WHERE user_id=p_user_id;
  END IF;

  UPDATE public.profiles SET coins=COALESCE(coins,0)+v_award, xp=COALESCE(xp,0)+v_xp_award, updated_at=now()
  WHERE id=p_user_id RETURNING coins INTO v_coins;

  IF v_award > 0 THEN
    INSERT INTO public.wallet_ledger(user_id,amount,type,reference_id,balance_after)
    VALUES (p_user_id,v_award,'daily_bonus',p_day::text,v_coins);
  END IF;

  RETURN jsonb_build_object('ok',true,'already',false,'coins',v_coins,'awarded',v_award,
    'xpAwarded',v_xp_award,'multiplier',v_mult,'streak',v_streak);
END;
$function$;

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
  v_claim public.daily_pack_claims%ROWTYPE;
  v_balance INT;
  v_streak INT := 1;
  v_prev DATE;
  v_best INT := 1;
  v_xp_awarded INT := 0;
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
  IF NOT (
    EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id=v_challenge.id)
    OR EXISTS (
      SELECT 1 FROM public.challenge_choices cc WHERE cc.challenge_id=v_challenge.id
      GROUP BY cc.challenge_id HAVING count(*) >= 2 AND bool_or(cc.is_correct=true)
    )
    OR (v_challenge.letter_pool IS NOT NULL AND cardinality(v_challenge.letter_pool)>0
        AND v_challenge.max_length IS NOT NULL
        AND v_challenge.max_length BETWEEN 1 AND cardinality(v_challenge.letter_pool))
  ) THEN RAISE EXCEPTION 'DAILY_PACK_CHALLENGE_NOT_PLAYABLE'; END IF;

  INSERT INTO public.daily_pack_completions(user_id,pack_id,slot_id,outcome,points)
  VALUES(p_user_id,p_pack_id,p_slot_id,p_outcome::public.answer_outcome,p_points)
  ON CONFLICT(user_id,slot_id) DO NOTHING RETURNING id INTO v_inserted;
  IF v_inserted IS NULL THEN RETURN jsonb_build_object('ok',true,'alreadyCompleted',true); END IF;

  SELECT count(*) INTO v_count FROM public.daily_pack_completions
  WHERE user_id=p_user_id AND pack_id=p_pack_id;
  IF v_count < 3 THEN RETURN jsonb_build_object('ok',true,'completed',v_count,'packComplete',false); END IF;

  INSERT INTO public.daily_pack_claims(user_id,pack_id,coins_awarded,xp_awarded)
  VALUES(p_user_id,p_pack_id,v_pack.bonus_coins,v_pack.bonus_xp)
  ON CONFLICT(user_id,pack_id) DO NOTHING RETURNING * INTO v_claim;
  IF v_claim.id IS NULL THEN
    RETURN jsonb_build_object('ok',true,'completed',v_count,'packComplete',true,'alreadyClaimed',true);
  END IF;

  SELECT current_streak,last_daily_date,longest_streak INTO v_streak,v_prev,v_best
  FROM public.user_streaks WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_streaks(user_id,current_streak,longest_streak,last_daily_date)
    VALUES(p_user_id,1,1,v_pack.pack_date);
    v_streak := 1;
  ELSE
    IF v_prev = v_pack.pack_date - 1 THEN v_streak := COALESCE(v_streak,0)+1;
    ELSIF v_prev = v_pack.pack_date THEN v_streak := COALESCE(v_streak,1);
    ELSE v_streak := 1;
    END IF;
    v_best := GREATEST(COALESCE(v_best,0),v_streak);
    UPDATE public.user_streaks SET current_streak=v_streak,longest_streak=v_best,last_daily_date=v_pack.pack_date,updated_at=now()
    WHERE user_id=p_user_id;
  END IF;

  UPDATE public.profiles SET coins=COALESCE(coins,0)+v_pack.bonus_coins,
    xp=COALESCE(xp,0)+v_pack.bonus_xp,updated_at=now()
  WHERE id=p_user_id RETURNING coins INTO v_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  v_xp_awarded := v_pack.bonus_xp;

  INSERT INTO public.wallet_ledger(user_id,amount,type,reference_id,balance_after)
  VALUES(p_user_id,v_pack.bonus_coins,'daily_pack_complete',p_pack_id::text,v_balance);

  RETURN jsonb_build_object('ok',true,'completed',v_count,'packComplete',true,
    'coinGain',v_pack.bonus_coins,'xpGain',v_xp_awarded,'streak',v_streak);
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_daily_atomic(UUID, DATE, UUID, TEXT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_atomic(UUID, DATE, UUID, TEXT, INT, INT, INT) TO service_role;
REVOKE ALL ON FUNCTION public.complete_daily_pack_slot_atomic(UUID, UUID, UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_pack_slot_atomic(UUID, UUID, UUID, TEXT, INT) TO service_role;

COMMIT;