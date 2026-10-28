-- Qaddaha production hardening batch 2026-10-28
-- Atomic, idempotent server-side transitions for economy, matches, teams,
-- tournament results, Daily invariants and account deletion.

CREATE OR REPLACE FUNCTION public.claim_daily_bonus_atomic(p_user_id UUID, p_amount INT DEFAULT 25)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day DATE := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_balance INT;
  v_claimed BOOLEAN := false;
BEGIN
  IF p_amount <= 0 OR p_amount > 100 THEN RAISE EXCEPTION 'INVALID_BONUS_AMOUNT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('daily_bonus:' || p_user_id::text || ':' || v_day::text, 0));
  INSERT INTO public.daily_bonus_claims(user_id, last_claim)
  VALUES (p_user_id, v_day)
  ON CONFLICT (user_id) DO UPDATE SET last_claim = EXCLUDED.last_claim
  WHERE public.daily_bonus_claims.last_claim <> v_day
  RETURNING true INTO v_claimed;
  IF NOT COALESCE(v_claimed, false) THEN
    SELECT coins INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN jsonb_build_object('coins', COALESCE(v_balance, 0), 'awarded', 0, 'already', true, 'day', v_day);
  END IF;
  v_balance := public.credit_coins(p_user_id, p_amount, 'daily_bonus', v_day::text);
  RETURN jsonb_build_object('coins', v_balance, 'awarded', p_amount, 'already', false, 'day', v_day);
END; $$;
REVOKE ALL ON FUNCTION public.claim_daily_bonus_atomic(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_bonus_atomic(UUID, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_match_reward_atomic(p_user_id UUID, p_match_id UUID, p_amount INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance INT;
  v_existing BOOLEAN;
BEGIN
  IF p_amount < 0 OR p_amount > 10000 THEN RAISE EXCEPTION 'INVALID_REWARD_AMOUNT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('match_reward:' || p_user_id::text || ':' || p_match_id::text, 0));
  SELECT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE user_id = p_user_id AND type = 'match_reward' AND reference_id = p_match_id::text) INTO v_existing;
  IF v_existing THEN
    SELECT coins INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN jsonb_build_object('coins', COALESCE(v_balance, 0), 'awarded', 0, 'already', true);
  END IF;
  v_balance := public.credit_coins(p_user_id, p_amount, 'match_reward', p_match_id::text);
  RETURN jsonb_build_object('coins', v_balance, 'awarded', p_amount, 'already', false);
END; $$;
REVOKE ALL ON FUNCTION public.claim_match_reward_atomic(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_match_reward_atomic(UUID, UUID, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.report_tournament_player_result_atomic(p_match_id UUID,p_user_id UUID,p_winner_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_m public.tournament_matches%ROWTYPE; v_loser UUID; v_pending INT; v_champion UUID; v_target UUID;
BEGIN
  SELECT * INTO v_m FROM public.tournament_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_MATCH_NOT_FOUND'; END IF;
  IF p_user_id<>v_m.player_a AND p_user_id<>v_m.player_b THEN RAISE EXCEPTION 'NOT_A_MATCH_PLAYER'; END IF;
  IF p_winner_id NOT IN (v_m.player_a,v_m.player_b) THEN RAISE EXCEPTION 'INVALID_WINNER'; END IF;
  IF v_m.status='completed' THEN RETURN jsonb_build_object('ok',true,'already',true,'winnerId',v_m.winner_id); END IF;
  v_loser := CASE WHEN p_winner_id=v_m.player_a THEN v_m.player_b ELSE v_m.player_a END;
  SELECT id INTO v_target FROM public.tournament_matches WHERE tournament_id=v_m.tournament_id AND round_number=v_m.round_number+1 AND status='pending' ORDER BY match_index NULLS LAST,created_at OFFSET GREATEST(COALESCE(v_m.match_index,1)-1,0)/2 LIMIT 1 FOR UPDATE;
  UPDATE public.tournament_matches SET winner_id=p_winner_id,status='completed' WHERE id=v_m.id;
  UPDATE public.tournament_entries SET wins=wins+1,points=points+3,eliminated=false WHERE tournament_id=v_m.tournament_id AND user_id=p_winner_id;
  UPDATE public.tournament_entries SET losses=losses+1,eliminated=true WHERE tournament_id=v_m.tournament_id AND user_id=v_loser;
  IF v_target IS NOT NULL THEN
    UPDATE public.tournament_matches SET player_a=CASE WHEN player_a IS NULL THEN p_winner_id ELSE player_a END, player_b=CASE WHEN player_a IS NOT NULL AND player_b IS NULL THEN p_winner_id ELSE player_b END WHERE id=v_target;
  END IF;
  SELECT count(*) INTO v_pending FROM public.tournament_matches WHERE tournament_id=v_m.tournament_id AND status<>'completed';
  IF v_pending=0 THEN SELECT winner_id INTO v_champion FROM public.tournament_matches WHERE tournament_id=v_m.tournament_id AND status='completed' ORDER BY round_number DESC,created_at DESC LIMIT 1; UPDATE public.tournaments SET status='completed',champion_id=v_champion,updated_at=now() WHERE id=v_m.tournament_id; END IF;
  RETURN jsonb_build_object('ok',true,'winnerId',p_winner_id,'pending',v_pending,'championId',v_champion);
END; $$;
REVOKE ALL ON FUNCTION public.report_tournament_player_result_atomic(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_tournament_player_result_atomic(UUID,UUID,UUID) TO service_role;

-- Preserve a team with a remaining member; remove an owner-only team before profile deletion.
