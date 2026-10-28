-- Solo leaf contract: exactly three sequential questions; two correct answers unlock the next leaf.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_solo_match_atomic(
  p_user_id UUID,
  p_journey_branch INT DEFAULT NULL,
  p_journey_leaf INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_match_id UUID;
  v_challenges UUID[] := ARRAY[]::UUID[];
  v_plan TEXT[] := ARRAY[]::TEXT[];
  v_round INT;
  v_stage INT;
  v_base INT;
  v_tier INT;
  v_diff TEXT;
  v_challenge UUID;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'USER_ID_REQUIRED'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF (p_journey_branch IS NULL) <> (p_journey_leaf IS NULL) THEN RAISE EXCEPTION 'INVALID_JOURNEY_STAGE'; END IF;
  IF p_journey_branch IS NOT NULL AND (p_journey_branch NOT BETWEEN 1 AND 6 OR p_journey_leaf NOT BETWEEN 1 AND 8) THEN RAISE EXCEPTION 'INVALID_JOURNEY_STAGE'; END IF;

  IF p_journey_branch IS NOT NULL THEN
    v_stage := ((p_journey_branch - 1) * 8) + p_journey_leaf;
    v_base := CASE WHEN v_stage <= 16 THEN 1 WHEN v_stage <= 40 THEN 2 ELSE 3 END;
    IF v_stage > 1 AND NOT EXISTS (
      SELECT 1 FROM public.solo_journey_progress
      WHERE user_id = p_user_id
        AND branch_number = CASE WHEN p_journey_leaf = 1 THEN p_journey_branch - 1 ELSE p_journey_branch END
        AND leaf_number = CASE WHEN p_journey_leaf = 1 THEN 8 ELSE p_journey_leaf - 1 END
    ) THEN RAISE EXCEPTION 'JOURNEY_STAGE_LOCKED'; END IF;
  END IF;

  FOR v_round IN 1..3 LOOP
    IF p_journey_branch IS NOT NULL THEN
      v_tier := LEAST(3, v_base + ((v_round - 1) / 2));
      v_diff := CASE v_tier WHEN 1 THEN 'easy' WHEN 2 THEN 'normal' ELSE 'hard' END;
    ELSE
      v_diff := NULL;
    END IF;
    SELECT c.id INTO v_challenge
    FROM public.challenges c
    WHERE c.active = true
      AND c.qa_status = 'approved'
      AND (v_diff IS NULL OR c.difficulty::text = v_diff)
      AND NOT (c.id = ANY(v_challenges))
      AND (
        EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id = c.id)
        OR EXISTS (
          SELECT 1 FROM public.challenge_choices cc
          WHERE cc.challenge_id = c.id
          GROUP BY cc.challenge_id
          HAVING count(*) >= 2 AND bool_or(cc.is_correct = true)
        )
        OR (c.letter_pool IS NOT NULL AND cardinality(c.letter_pool) > 0 AND c.max_length IS NOT NULL AND c.max_length BETWEEN 1 AND cardinality(c.letter_pool))
      )
    ORDER BY random()
    LIMIT 1;
    IF v_challenge IS NULL THEN RAISE EXCEPTION 'NOT_ENOUGH_PLAYABLE_CHALLENGES'; END IF;
    v_challenges := array_append(v_challenges, v_challenge);
    v_plan := array_append(v_plan, COALESCE(v_diff, (SELECT difficulty::text FROM public.challenges WHERE id = v_challenge)));
  END LOOP;

  INSERT INTO public.matches(mode, status, difficulty, current_round, total_rounds, sequence, server_now, config_snapshot)
  VALUES (
    'solo', 'VS', 'normal', 1, 3, 1, now(),
    CASE WHEN p_journey_branch IS NOT NULL THEN jsonb_build_object(
      'journeyBranch', p_journey_branch,
      'journeyLeaf', p_journey_leaf,
      'difficultyPlan', to_jsonb(v_plan),
      'requiredCorrect', 2,
      'leafQuestions', 3
    ) ELSE NULL END
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants(match_id, user_id, side, score, is_ai, username, avatar_url, state)
  VALUES
    (v_match_id, p_user_id, 'player', 0, false, COALESCE(v_profile.username, 'player'), v_profile.avatar_url, 'active'),
    (v_match_id, NULL, 'ai', 0, true, 'خصم قدها', NULL, 'active');
  UPDATE public.match_participants SET ai_difficulty = 'normal' WHERE match_id = v_match_id AND is_ai = true;
  INSERT INTO public.rounds(match_id, round_number, challenge_id, status, sequence)
  SELECT v_match_id, n, v_challenges[n], 'pending', 0 FROM generate_series(1, 3) n;
  RETURN jsonb_build_object('matchId', v_match_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_solo_journey_leaf(
  p_user_id UUID,
  p_branch_number INT,
  p_leaf_number INT,
  p_match_id UUID
)
RETURNS TABLE(ok BOOLEAN, already_completed BOOLEAN, next_branch INT, next_leaf INT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_match RECORD;
  v_inserted BOOLEAN := false;
  v_next_index INT;
BEGIN
  IF p_user_id IS NULL OR p_match_id IS NULL OR p_branch_number NOT BETWEEN 1 AND 6 OR p_leaf_number NOT BETWEEN 1 AND 8 THEN
    RETURN QUERY SELECT false, false, NULL::INT, NULL::INT; RETURN;
  END IF;

  SELECT m.mode, m.status, m.total_rounds, m.config_snapshot INTO v_match
  FROM public.matches m WHERE m.id = p_match_id;
  IF NOT FOUND OR v_match.mode <> 'solo' OR v_match.status NOT IN ('MATCH_FINISHED', 'FINAL_RESULT') OR v_match.total_rounds <> 3 THEN
    RETURN QUERY SELECT false, false, NULL::INT, NULL::INT; RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.match_participants mp
    WHERE mp.match_id = p_match_id AND mp.user_id = p_user_id AND mp.is_ai = false
  ) THEN
    RETURN QUERY SELECT false, false, NULL::INT, NULL::INT; RETURN;
  END IF;
  IF COALESCE((v_match.config_snapshot->>'journeyBranch')::INT, 0) <> p_branch_number
     OR COALESCE((v_match.config_snapshot->>'journeyLeaf')::INT, 0) <> p_leaf_number THEN
    RETURN QUERY SELECT false, false, NULL::INT, NULL::INT; RETURN;
  END IF;
  IF (SELECT count(*) FROM public.answer_submissions a WHERE a.match_id = p_match_id AND a.user_id = p_user_id AND a.outcome = 'correct') < 2 THEN
    RETURN QUERY SELECT false, false, NULL::INT, NULL::INT; RETURN;
  END IF;
  IF p_branch_number <> 1 OR p_leaf_number <> 1 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.solo_journey_progress prev
      WHERE prev.user_id = p_user_id
        AND (prev.branch_number * 8 + prev.leaf_number) = (p_branch_number * 8 + p_leaf_number - 1)
    ) THEN
      RETURN QUERY SELECT false, false, NULL::INT, NULL::INT; RETURN;
    END IF;
  END IF;

  INSERT INTO public.solo_journey_progress(user_id, branch_number, leaf_number, completion_match_id)
  VALUES (p_user_id, p_branch_number, p_leaf_number, p_match_id)
  ON CONFLICT (user_id, branch_number, leaf_number) DO NOTHING;
  v_inserted := FOUND;
  v_next_index := p_branch_number * 8 + p_leaf_number + 1;
  RETURN QUERY SELECT true, NOT v_inserted,
    CASE WHEN v_next_index <= 48 THEN ((v_next_index - 1) / 8) ELSE NULL END,
    CASE WHEN v_next_index <= 48 THEN (((v_next_index - 1) % 8) + 1) ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.create_solo_match_atomic(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_solo_match_atomic(UUID, INT, INT) TO service_role;
REVOKE ALL ON FUNCTION public.complete_solo_journey_leaf(UUID, INT, INT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_solo_journey_leaf(UUID, INT, INT, UUID) TO service_role;
COMMIT;
