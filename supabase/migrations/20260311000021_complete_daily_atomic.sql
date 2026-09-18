CREATE OR REPLACE FUNCTION public.complete_daily_atomic(
  p_user_id UUID,
  p_day DATE,
  p_challenge_id UUID,
  p_outcome TEXT,
  p_points INT,
  p_bonus_coins INT,
  p_bonus_xp INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing UUID;
  v_coins INT;
  v_mult INT := 1;
  v_plan TEXT;
  v_exp TIMESTAMPTZ;
  v_award INT;
  v_streak INT := 1;
  v_prev DATE;
  v_best INT := 1;
BEGIN
  SELECT id INTO v_existing
  FROM public.daily_completions
  WHERE user_id = p_user_id AND challenge_date = p_day;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  SELECT subscription_plan, subscription_expires_at INTO v_plan, v_exp
  FROM public.profiles WHERE id = p_user_id;

  IF v_plan IN ('plus_monthly', 'plus_yearly', 'host_pro')
     AND (v_exp IS NULL OR v_exp > now()) THEN
    v_mult := 2;
  END IF;

  v_award := GREATEST(0, p_bonus_coins) * v_mult;

  INSERT INTO public.daily_completions (user_id, challenge_date, outcome, points)
  VALUES (p_user_id, p_day, p_outcome::public.answer_outcome, p_points)
  ON CONFLICT (user_id, challenge_date) DO NOTHING
  RETURNING id INTO v_existing;

  IF v_existing IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  SELECT current_streak, last_daily_date, longest_streak
    INTO v_streak, v_prev, v_best
  FROM public.user_streaks WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_streaks (user_id, current_streak, longest_streak, last_daily_date)
    VALUES (p_user_id, 1, 1, p_day);
    v_streak := 1;
  ELSE
    IF v_prev IS NOT NULL AND v_prev = (p_day - 1) THEN
      v_streak := COALESCE(v_streak, 0) + 1;
    ELSIF v_prev IS NOT NULL AND v_prev = p_day THEN
      v_streak := COALESCE(v_streak, 1);
    ELSE
      v_streak := 1;
    END IF;
    v_best := GREATEST(COALESCE(v_best, 0), v_streak);
    UPDATE public.user_streaks SET
      current_streak = v_streak,
      longest_streak = v_best,
      last_daily_date = p_day,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  IF v_award > 0 OR (p_bonus_xp * v_mult) > 0 THEN
    UPDATE public.profiles SET
      coins = COALESCE(coins, 0) + v_award,
      xp = COALESCE(xp, 0) + (GREATEST(0, p_bonus_xp) * v_mult),
      updated_at = now()
    WHERE id = p_user_id
    RETURNING coins INTO v_coins;
  ELSE
    SELECT coins INTO v_coins FROM public.profiles WHERE id = p_user_id;
  END IF;

  IF v_award > 0 THEN
    BEGIN
      INSERT INTO public.wallet_ledger (user_id, amount, type, reference_id, balance_after)
      VALUES (p_user_id, v_award, 'daily_bonus', p_day::text, v_coins);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'coins', v_coins,
    'awarded', v_award,
    'multiplier', v_mult,
    'streak', v_streak
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_daily_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_daily_atomic TO service_role;
