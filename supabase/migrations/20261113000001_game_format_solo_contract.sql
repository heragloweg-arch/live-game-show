-- Original game formats for Solo matches.
-- The client may request a format, but the server owns filtering and content eligibility.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_solo_match_atomic(
  p_user_id UUID,
  p_journey_branch INT,
  p_journey_leaf INT,
  p_format TEXT
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
  v_format TEXT := lower(coalesce(nullif(trim(p_format), ''), 'mixed'));
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'USER_ID_REQUIRED'; END IF;
  IF v_format NOT IN ('mixed', 'speed', 'letters', 'knowledge', 'words') THEN
    RAISE EXCEPTION 'INVALID_GAME_FORMAT';
  END IF;
  -- Journey leaves stay a curated mixed experience. Focused formats are for quick Solo rounds.
  IF p_journey_branch IS NOT NULL OR p_journey_leaf IS NOT NULL THEN
    v_format := 'mixed';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF (p_journey_branch IS NULL) <> (p_journey_leaf IS NULL) THEN RAISE EXCEPTION 'INVALID_JOURNEY_STAGE'; END IF;
  IF p_journey_branch IS NOT NULL AND (p_journey_branch NOT BETWEEN 1 AND 6 OR p_journey_leaf NOT BETWEEN 1 AND 8) THEN
    RAISE EXCEPTION 'INVALID_JOURNEY_STAGE';
  END IF;

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
        v_format = 'mixed'
        OR (v_format = 'speed' AND c.type::text = 'speed')
        OR (v_format = 'letters' AND c.subtype::text = 'letters')
        OR (v_format = 'knowledge' AND c.type::text = 'knowledge')
        OR (v_format = 'words' AND c.type::text = 'words')
      )
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

    IF v_challenge IS NULL THEN
      IF v_format <> 'mixed' THEN RAISE EXCEPTION 'GAME_FORMAT_NOT_AVAILABLE'; END IF;
      RAISE EXCEPTION 'NOT_ENOUGH_PLAYABLE_CHALLENGES';
    END IF;
    v_challenges := array_append(v_challenges, v_challenge);
    v_plan := array_append(v_plan, COALESCE(v_diff, (SELECT difficulty::text FROM public.challenges WHERE id = v_challenge)));
  END LOOP;

  INSERT INTO public.matches(mode, status, difficulty, current_round, total_rounds, sequence, server_now, config_snapshot)
  VALUES (
    'solo', 'VS', 'normal', 1, 3, 1, now(),
    jsonb_build_object(
      'format', v_format,
      'difficultyPlan', to_jsonb(v_plan),
      'journeyBranch', p_journey_branch,
      'journeyLeaf', p_journey_leaf,
      'requiredCorrect', CASE WHEN p_journey_branch IS NOT NULL THEN 2 ELSE NULL END,
      'leafQuestions', CASE WHEN p_journey_branch IS NOT NULL THEN 3 ELSE NULL END
    )
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants(match_id, user_id, side, score, is_ai, username, avatar_url, state)
  VALUES
    (v_match_id, p_user_id, 'player', 0, false, COALESCE(v_profile.username, 'player'), v_profile.avatar_url, 'active'),
    (v_match_id, NULL, 'ai', 0, true, 'خصم قدها', NULL, 'active');
  UPDATE public.match_participants SET ai_difficulty = 'normal' WHERE match_id = v_match_id AND is_ai = true;
  INSERT INTO public.rounds(match_id, round_number, challenge_id, status, sequence)
  SELECT v_match_id, n, v_challenges[n], 'pending', 0 FROM generate_series(1, 3) n;
  RETURN jsonb_build_object('matchId', v_match_id, 'format', v_format);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_solo_match_atomic(UUID, INT, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_solo_match_atomic(UUID, INT, INT, TEXT) TO service_role;

COMMIT;
