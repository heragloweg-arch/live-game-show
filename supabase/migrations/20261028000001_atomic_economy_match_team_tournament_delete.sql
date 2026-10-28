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

CREATE OR REPLACE FUNCTION public.create_match_bundle_atomic(
  p_mode TEXT,
  p_difficulty TEXT DEFAULT 'normal',
  p_user_ids UUID[] DEFAULT '{}'::uuid[],
  p_rematch_of UUID DEFAULT NULL,
  p_couple_id UUID DEFAULT NULL,
  p_team_a_id UUID DEFAULT NULL,
  p_team_b_id UUID DEFAULT NULL,
  p_total_rounds INT DEFAULT 5,
  p_challenge_ids UUID[] DEFAULT '{}'::uuid[],
  p_config_snapshot JSONB DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match UUID;
  v_challenges UUID[];
  v_mode public.match_mode;
  v_difficulty public.difficulty_level;
  v_count INT;
  v_now TIMESTAMPTZ := now();
  r RECORD;
BEGIN
  IF p_mode NOT IN ('solo','1v1','couple','team') THEN RAISE EXCEPTION 'INVALID_MATCH_MODE'; END IF;
  IF p_total_rounds < 1 OR p_total_rounds > 15 THEN RAISE EXCEPTION 'INVALID_ROUND_COUNT'; END IF;
  v_mode := p_mode::public.match_mode;
  v_difficulty := CASE WHEN p_difficulty IN ('easy','normal','hard') THEN p_difficulty::public.difficulty_level ELSE 'normal'::public.difficulty_level END;
  IF p_mode = '1v1' AND cardinality(p_user_ids) <> 2 THEN RAISE EXCEPTION 'TWO_PLAYERS_REQUIRED'; END IF;
  IF p_mode IN ('solo','couple') AND cardinality(p_user_ids) < 1 THEN RAISE EXCEPTION 'PLAYER_REQUIRED'; END IF;
  IF p_mode = 'couple' AND (p_couple_id IS NULL OR cardinality(p_user_ids) <> 2) THEN RAISE EXCEPTION 'COUPLE_REQUIRED'; END IF;
  IF p_mode = 'team' AND (p_team_a_id IS NULL OR p_team_b_id IS NULL OR p_team_a_id = p_team_b_id) THEN RAISE EXCEPTION 'TWO_TEAMS_REQUIRED'; END IF;

  IF cardinality(p_challenge_ids) = p_total_rounds THEN
    SELECT array_agg(c.id ORDER BY u.ord) INTO v_challenges
    FROM unnest(p_challenge_ids) WITH ORDINALITY AS u(id,ord)
    JOIN public.challenges c ON c.id=u.id
    WHERE c.active=true AND c.qa_status='approved';
  END IF;
  IF COALESCE(cardinality(v_challenges), 0) <> p_total_rounds THEN
    SELECT array_agg(x.id ORDER BY x.rank) INTO v_challenges FROM (
    SELECT c.id, row_number() OVER (ORDER BY random()) AS rank
    FROM public.challenges c
    WHERE c.active = true AND c.qa_status = 'approved' AND c.difficulty = v_difficulty
      AND (EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id = c.id)
        OR (SELECT count(*) FROM public.challenge_choices cc WHERE cc.challenge_id = c.id) >= 2)
    LIMIT p_total_rounds
    ) x;
  END IF;
  IF COALESCE(cardinality(v_challenges), 0) <> p_total_rounds THEN RAISE EXCEPTION 'NOT_ENOUGH_PLAYABLE_CHALLENGES'; END IF;

  IF p_mode = 'team' THEN
    SELECT count(*) INTO v_count FROM public.team_members WHERE team_id = p_team_a_id;
    IF v_count < 1 OR v_count > 5 THEN RAISE EXCEPTION 'TEAM_A_SIZE_INVALID'; END IF;
    SELECT count(*) INTO v_count FROM public.team_members WHERE team_id = p_team_b_id;
    IF v_count < 1 OR v_count > 5 THEN RAISE EXCEPTION 'TEAM_B_SIZE_INVALID'; END IF;
  END IF;

  INSERT INTO public.matches(mode,status,difficulty,current_round,total_rounds,sequence,server_now,started_at,rematch_of,couple_id,team_size,team_a_id,team_b_id,config_snapshot)
  VALUES (v_mode,'VS',v_difficulty,1,p_total_rounds,1,v_now,v_now,p_rematch_of,p_couple_id,
    CASE WHEN p_mode='team' THEN (SELECT max_members FROM public.teams WHERE id=p_team_a_id) ELSE NULL END,p_team_a_id,p_team_b_id,p_config_snapshot)
  RETURNING id INTO v_match;

  IF p_mode = 'team' THEN
    INSERT INTO public.match_participants(match_id,user_id,side,score,is_ai,username,avatar_url)
    SELECT v_match, tm.user_id, CASE WHEN tm.team_id=p_team_a_id THEN 'team_a'::public.participant_side ELSE 'team_b'::public.participant_side END, 0, false,
      COALESCE(p.display_name,p.username,tm.user_id::text), p.avatar_url
    FROM public.team_members tm JOIN public.profiles p ON p.id=tm.user_id
    WHERE tm.team_id IN (p_team_a_id,p_team_b_id);
  ELSE
    INSERT INTO public.match_participants(match_id,user_id,side,score,is_ai,username,avatar_url)
    SELECT v_match, u.user_id,
      CASE WHEN p_mode='couple' OR ord=1 THEN 'player'::public.participant_side ELSE 'opponent'::public.participant_side END,
      0,false,COALESCE(p.display_name,p.username,u.user_id::text),p.avatar_url
    FROM unnest(p_user_ids) WITH ORDINALITY AS u(user_id,ord)
    JOIN public.profiles p ON p.id=u.user_id;
    IF p_mode IN ('solo','couple') THEN
      INSERT INTO public.match_participants(match_id,user_id,side,score,is_ai,ai_difficulty,username,avatar_url)
      VALUES (v_match,NULL,'ai',0,true,v_difficulty,CASE WHEN p_mode='couple' THEN 'الخصم الذكي' ELSE 'خصم قدها' END,'/icons/app-icon.png');
    END IF;
  END IF;

  INSERT INTO public.rounds(match_id,round_number,challenge_id,status,sequence)
  SELECT v_match, ord, challenge_id, 'pending', 0 FROM unnest(v_challenges) WITH ORDINALITY AS x(challenge_id,ord);
  IF p_mode='couple' THEN UPDATE public.couples SET last_match_id=v_match, updated_at=v_now WHERE id=p_couple_id; END IF;
  RETURN jsonb_build_object('ok',true,'matchId',v_match,'rounds',p_total_rounds);
END; $$;
REVOKE ALL ON FUNCTION public.create_match_bundle_atomic(TEXT,TEXT,UUID[],UUID,UUID,UUID,UUID,INT,UUID[],JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_match_bundle_atomic(TEXT,TEXT,UUID[],UUID,UUID,UUID,UUID,INT,UUID[],JSONB) TO service_role;

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
