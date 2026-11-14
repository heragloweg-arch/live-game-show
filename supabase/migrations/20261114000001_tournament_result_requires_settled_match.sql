-- P0 integrity gate: tournament results are derived only from a server-settled match.
-- A client/user may not self-report a winner for an unplayed fixture.
BEGIN;

CREATE OR REPLACE FUNCTION public.report_tournament_player_result_atomic(
  p_match_id UUID,
  p_user_id UUID,
  p_winner_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m public.tournament_matches%ROWTYPE;
  v_loser UUID;
  v_pending INT;
  v_champion UUID;
  v_target UUID;
BEGIN
  SELECT * INTO v_m FROM public.tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_MATCH_NOT_FOUND'; END IF;
  IF p_user_id <> v_m.player_a AND p_user_id <> v_m.player_b THEN RAISE EXCEPTION 'NOT_A_MATCH_PLAYER'; END IF;
  IF p_winner_id NOT IN (v_m.player_a, v_m.player_b) THEN RAISE EXCEPTION 'INVALID_WINNER'; END IF;
  IF v_m.status = 'completed' THEN RETURN jsonb_build_object('ok', true, 'already', true, 'winnerId', v_m.winner_id); END IF;
  IF v_m.match_id IS NULL THEN RAISE EXCEPTION 'MATCH_NOT_SETTLED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = v_m.match_id AND m.status::text = 'MATCH_FINISHED'
  ) THEN RAISE EXCEPTION 'MATCH_NOT_SETTLED'; END IF;

  v_loser := CASE WHEN p_winner_id = v_m.player_a THEN v_m.player_b ELSE v_m.player_a END;
  SELECT id INTO v_target
  FROM public.tournament_matches
  WHERE tournament_id = v_m.tournament_id AND round_number = v_m.round_number + 1 AND status = 'pending'
  ORDER BY match_index NULLS LAST, created_at
  OFFSET GREATEST(COALESCE(v_m.match_index, 1) - 1, 0) / 2 LIMIT 1 FOR UPDATE;
  UPDATE public.tournament_matches SET winner_id = p_winner_id, status = 'completed' WHERE id = v_m.id;
  UPDATE public.tournament_entries SET wins = wins + 1, points = points + 3, eliminated = false
    WHERE tournament_id = v_m.tournament_id AND user_id = p_winner_id;
  UPDATE public.tournament_entries SET losses = losses + 1, eliminated = true
    WHERE tournament_id = v_m.tournament_id AND user_id = v_loser;
  IF v_target IS NOT NULL THEN
    UPDATE public.tournament_matches
    SET player_a = CASE WHEN player_a IS NULL THEN p_winner_id ELSE player_a END,
        player_b = CASE WHEN player_a IS NOT NULL AND player_b IS NULL THEN p_winner_id ELSE player_b END
    WHERE id = v_target;
  END IF;
  SELECT count(*) INTO v_pending FROM public.tournament_matches
    WHERE tournament_id = v_m.tournament_id AND status <> 'completed';
  IF v_pending = 0 THEN
    SELECT winner_id INTO v_champion FROM public.tournament_matches
      WHERE tournament_id = v_m.tournament_id AND status = 'completed'
      ORDER BY round_number DESC, created_at DESC LIMIT 1;
    UPDATE public.tournaments SET status = 'completed', champion_id = v_champion, updated_at = now()
      WHERE id = v_m.tournament_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'winnerId', p_winner_id, 'pending', v_pending, 'championId', v_champion);
END; $$;

CREATE OR REPLACE FUNCTION public.report_tournament_team_result(
  p_tournament_match_id UUID,
  p_user_id UUID,
  p_winner_team_id UUID DEFAULT NULL,
  p_is_draw BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m public.tournament_matches%ROWTYPE;
  v_t public.tournaments%ROWTYPE;
  v_a public.tournament_teams%ROWTYPE;
  v_b public.tournament_teams%ROWTYPE;
  v_pending INT;
  v_champion UUID;
BEGIN
  SELECT * INTO v_m FROM public.tournament_matches WHERE id = p_tournament_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FIXTURE_NOT_FOUND'; END IF;
  IF v_m.status = 'completed' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF v_m.match_id IS NULL THEN RAISE EXCEPTION 'MATCH_NOT_SETTLED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = v_m.match_id AND m.status::text = 'MATCH_FINISHED'
  ) THEN RAISE EXCEPTION 'MATCH_NOT_SETTLED'; END IF;
  IF p_winner_team_id IS NOT NULL AND p_winner_team_id NOT IN (v_m.team_a_id, v_m.team_b_id) THEN RAISE EXCEPTION 'INVALID_WINNER_TEAM'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournament_team_members WHERE user_id = p_user_id AND tournament_team_id IN (v_m.team_a_id, v_m.team_b_id)) THEN RAISE EXCEPTION 'NOT_A_TEAM_MEMBER'; END IF;
  SELECT * INTO v_t FROM public.tournaments WHERE id = v_m.tournament_id FOR UPDATE;
  SELECT * INTO v_a FROM public.tournament_teams WHERE id = v_m.team_a_id FOR UPDATE;
  SELECT * INTO v_b FROM public.tournament_teams WHERE id = v_m.team_b_id FOR UPDATE;
  UPDATE public.tournament_matches SET status = 'completed', winning_team_id = p_winner_team_id, is_draw = p_is_draw WHERE id = v_m.id;
  UPDATE public.tournament_teams SET played = played + 1,
    points = points + CASE WHEN p_is_draw THEN 1 WHEN id = p_winner_team_id THEN 3 ELSE 0 END,
    wins = wins + CASE WHEN NOT p_is_draw AND id = p_winner_team_id THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN p_is_draw THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN NOT p_is_draw AND id <> p_winner_team_id THEN 1 ELSE 0 END
    WHERE id IN (v_m.team_a_id, v_m.team_b_id);
  SELECT count(*) INTO v_pending FROM public.tournament_matches WHERE tournament_id = v_m.tournament_id AND status <> 'completed';
  IF v_pending = 0 THEN
    SELECT id INTO v_champion FROM public.tournament_teams WHERE tournament_id = v_m.tournament_id
      ORDER BY points DESC, wins DESC, (played - wins - draws) ASC, joined_at LIMIT 1;
    UPDATE public.tournaments SET status = 'completed', champion_team_id = v_champion, updated_at = now() WHERE id = v_m.tournament_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'pending', v_pending, 'championTeamId', v_champion);
END; $$;

REVOKE ALL ON FUNCTION public.report_tournament_player_result_atomic(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_tournament_player_result_atomic(UUID, UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.report_tournament_team_result(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_tournament_team_result(UUID, UUID, UUID, BOOLEAN) TO service_role;

COMMIT;
