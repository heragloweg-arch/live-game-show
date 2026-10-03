-- Tournament matches become real server matches through one idempotent RPC.
CREATE OR REPLACE FUNCTION public.start_bracket_match(p_tournament_match_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tm public.tournament_matches%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_match UUID;
  v_challenges UUID[];
BEGIN
  SELECT * INTO v_tm FROM public.tournament_matches WHERE id = p_tournament_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_MATCH_NOT_FOUND'; END IF;
  IF p_user_id <> v_tm.player_a AND p_user_id <> v_tm.player_b THEN RAISE EXCEPTION 'NOT_A_MATCH_PLAYER'; END IF;
  IF v_tm.status = 'completed' THEN RAISE EXCEPTION 'MATCH_COMPLETED'; END IF;
  IF v_tm.match_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'matchId', v_tm.match_id, 'alreadyStarted', true);
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_tm.tournament_id;
  SELECT array_agg(x.id) INTO v_challenges FROM (
    SELECT c.id FROM public.challenges c
    WHERE c.active = true AND c.qa_status = 'approved' AND c.difficulty = v_tournament.difficulty
      AND (
        EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id = c.id)
        OR EXISTS (
          SELECT 1 FROM public.challenge_choices cc WHERE cc.challenge_id = c.id
          GROUP BY cc.challenge_id HAVING count(*) >= 2 AND bool_or(cc.is_correct = true)
        )
        OR (c.letter_pool IS NOT NULL AND cardinality(c.letter_pool) > 0)
      )
    ORDER BY random() LIMIT 5
  ) x;
  IF COALESCE(cardinality(v_challenges), 0) < 5 THEN RAISE EXCEPTION 'NOT_ENOUGH_PLAYABLE_CHALLENGES'; END IF;

  INSERT INTO public.matches(mode, status, difficulty, current_round, total_rounds, sequence, started_at, server_now)
  VALUES ('1v1', 'VS', v_tournament.difficulty, 1, 5, 1, now(), now()) RETURNING id INTO v_match;

  INSERT INTO public.match_participants(match_id, user_id, side, username, avatar_url)
    SELECT v_match, p.id,
      CASE WHEN p.id = v_tm.player_a THEN 'player'::public.participant_side ELSE 'opponent'::public.participant_side END,
      COALESCE(p.username, p.id::text), p.avatar_url
    FROM public.profiles p WHERE p.id IN (v_tm.player_a, v_tm.player_b)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.rounds(match_id, round_number, challenge_id, status, sequence)
    SELECT v_match, n, v_challenges[n], 'pending', 0 FROM generate_series(1, 5) AS n;

  UPDATE public.tournament_matches SET match_id = v_match, status = 'active' WHERE id = p_tournament_match_id;
  RETURN jsonb_build_object('ok', true, 'matchId', v_match, 'alreadyStarted', false);
END; $$;
REVOKE ALL ON FUNCTION public.start_bracket_match(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_bracket_match(UUID, UUID) TO service_role;
