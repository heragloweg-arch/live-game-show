-- P0: make timeout-to-AI fallback idempotent and atomic.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_matchmaking_ai_fallback_atomic(
  p_user_id UUID,
  p_difficulty TEXT DEFAULT 'normal'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_match_id UUID;
  v_difficulty public.difficulty_level;
  v_challenges UUID[];
  v_username TEXT;
  v_avatar TEXT;
  v_queue public.matchmaking_queue%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'USER_ID_REQUIRED'; END IF;
  IF COALESCE(p_difficulty, '') NOT IN ('easy', 'normal', 'hard') THEN RAISE EXCEPTION 'INVALID_DIFFICULTY'; END IF;
  v_difficulty := p_difficulty::public.difficulty_level;

  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha:ai-fallback:' || p_user_id::text, 0));

  SELECT mp.match_id INTO v_match_id
  FROM public.match_participants mp
  JOIN public.matches m ON m.id = mp.match_id
  WHERE mp.user_id = p_user_id AND m.mode = '1v1'
    AND m.status IN ('VS', 'ROUND_STARTING', 'ROUND_ACTIVE')
  ORDER BY mp.joined_at DESC LIMIT 1;
  IF v_match_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'matched', 'matchId', v_match_id, 'alreadyMatched', true);
  END IF;

  SELECT * INTO v_queue FROM public.matchmaking_queue
  WHERE user_id = p_user_id AND status = 'queued'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'idle'); END IF;
  IF v_queue.enqueued_at > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('status', 'queued', 'retryAfterMs',
      GREATEST(0, (extract(epoch FROM (v_queue.enqueued_at + interval '60 seconds' - now())) * 1000)::integer));
  END IF;

  SELECT array_agg(candidate.id ORDER BY candidate.pick_order)
  INTO v_challenges
  FROM (
    SELECT c.id, row_number() OVER (ORDER BY random()) AS pick_order
    FROM public.challenges c
    WHERE c.active = true AND c.qa_status = 'approved' AND c.difficulty = v_difficulty
      AND (
        EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id = c.id)
        OR EXISTS (
          SELECT 1 FROM public.challenge_choices cc
          WHERE cc.challenge_id = c.id GROUP BY cc.challenge_id
          HAVING count(*) >= 2 AND bool_or(cc.is_correct = true)
        )
        OR (c.letter_pool IS NOT NULL AND cardinality(c.letter_pool) > 0
            AND c.max_length IS NOT NULL AND c.max_length BETWEEN 1 AND cardinality(c.letter_pool))
      )
    LIMIT 5
  ) candidate;

  IF COALESCE(cardinality(v_challenges), 0) <> 5 THEN
    RETURN jsonb_build_object('status', 'queued', 'reason', 'NOT_ENOUGH_PLAYABLE_CHALLENGES');
  END IF;

  SELECT username, display_name, avatar_url INTO v_username, v_avatar
  FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.matches(mode, status, difficulty, current_round, total_rounds, sequence, server_now, started_at)
  VALUES ('1v1', 'VS', v_difficulty, 1, 5, 1, now(), now())
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants(match_id, user_id, side, score, username, avatar_url, is_ai, ai_difficulty, state)
  VALUES
    (v_match_id, p_user_id, 'player', 0, COALESCE(v_username, 'لاعب'), v_avatar, false, NULL, 'active'),
    (v_match_id, NULL, 'ai', 0, 'خصم الكمبيوتر', '/icons/app-icon.png', true, v_difficulty, 'active');

  INSERT INTO public.rounds(match_id, round_number, challenge_id, status, sequence)
  SELECT v_match_id, slot, v_challenges[slot], 'pending', 0 FROM generate_series(1, 5) AS slot;

  UPDATE public.matchmaking_queue SET status = 'matched', updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('status', 'matched', 'matchId', v_match_id, 'fallbackAi', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_matchmaking_ai_fallback_atomic(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_matchmaking_ai_fallback_atomic(UUID, TEXT) TO service_role;

COMMIT;