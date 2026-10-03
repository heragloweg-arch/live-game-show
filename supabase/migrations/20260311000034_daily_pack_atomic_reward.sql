-- Full-pack reward: station completion is progress; only 3/3 claims the pack reward and streak.
CREATE TABLE IF NOT EXISTS public.daily_pack_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES public.daily_packs(id) ON DELETE CASCADE,
  coins_awarded INT NOT NULL DEFAULT 0,
  xp_awarded INT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, pack_id)
);
ALTER TABLE public.daily_pack_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_pack_claims_select ON public.daily_pack_claims;
CREATE POLICY daily_pack_claims_select ON public.daily_pack_claims FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.complete_daily_pack_slot_atomic(
  p_user_id UUID, p_pack_id UUID, p_slot_id UUID, p_outcome TEXT, p_points INT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pack public.daily_packs%ROWTYPE; v_inserted UUID; v_count INT; v_claim public.daily_pack_claims%ROWTYPE; v_balance INT; v_streak INT := 1; v_prev DATE; v_best INT := 1; v_day DATE;
BEGIN
  SELECT * INTO v_pack FROM public.daily_packs WHERE id=p_pack_id AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_PACK_NOT_FOUND'; END IF;
  v_day := v_pack.pack_date;
  INSERT INTO public.daily_pack_completions(user_id, pack_id, slot_id, outcome, points)
  VALUES(p_user_id, p_pack_id, p_slot_id, p_outcome::public.answer_outcome, p_points)
  ON CONFLICT(user_id, slot_id) DO NOTHING RETURNING id INTO v_inserted;
  IF v_inserted IS NULL THEN RETURN jsonb_build_object('ok', true, 'alreadyCompleted', true); END IF;
  SELECT count(*) INTO v_count FROM public.daily_pack_completions WHERE user_id=p_user_id AND pack_id=p_pack_id;
  IF v_count < 3 THEN RETURN jsonb_build_object('ok', true, 'completed', v_count, 'packComplete', false); END IF;
  INSERT INTO public.daily_pack_claims(user_id, pack_id, coins_awarded, xp_awarded)
  VALUES(p_user_id, p_pack_id, v_pack.bonus_coins, v_pack.bonus_xp)
  ON CONFLICT(user_id, pack_id) DO NOTHING RETURNING * INTO v_claim;
  IF v_claim.id IS NULL THEN RETURN jsonb_build_object('ok', true, 'completed', 3, 'packComplete', true, 'alreadyClaimed', true); END IF;
  SELECT current_streak, last_daily_date, longest_streak INTO v_streak, v_prev, v_best FROM public.user_streaks WHERE user_id=p_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_streaks(user_id,current_streak,longest_streak,last_daily_date) VALUES(p_user_id,1,1,v_day);
  ELSE
    IF v_prev = v_day - 1 THEN v_streak := COALESCE(v_streak,0)+1; ELSE v_streak := 1; END IF;
    v_best := GREATEST(COALESCE(v_best,0), v_streak);
    UPDATE public.user_streaks SET current_streak=v_streak,longest_streak=v_best,last_daily_date=v_day,updated_at=now() WHERE user_id=p_user_id;
  END IF;
  UPDATE public.profiles SET coins=COALESCE(coins,0)+v_pack.bonus_coins, xp=COALESCE(xp,0)+v_pack.bonus_xp, updated_at=now() WHERE id=p_user_id RETURNING coins INTO v_balance;
  INSERT INTO public.wallet_ledger(user_id,amount,type,reference_id,balance_after) VALUES(p_user_id,v_pack.bonus_coins,'daily_pack_complete',p_pack_id::text,v_balance);
  RETURN jsonb_build_object('ok',true,'completed',3,'packComplete',true,'coinGain',v_pack.bonus_coins,'xpGain',v_pack.bonus_xp,'streak',v_streak);
END; $$;
REVOKE ALL ON FUNCTION public.complete_daily_pack_slot_atomic(UUID,UUID,UUID,TEXT,INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_daily_pack_slot_atomic(UUID,UUID,UUID,TEXT,INT) TO service_role;
