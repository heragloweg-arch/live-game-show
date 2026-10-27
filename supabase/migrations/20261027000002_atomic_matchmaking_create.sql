-- P0: atomically claim a 1v1 queue opponent and create a complete match.
-- This replaces the client-side sequence (claim opponent -> create match -> insert participants -> insert rounds)
-- that could lose queue entries or leave partial matches when any request failed.
BEGIN;

CREATE OR REPLACE FUNCTION public.join_matchmaking_atomic(
  p_user_id UUID,
  p_region TEXT DEFAULT 'mena',
  p_difficulty TEXT DEFAULT 'normal'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_opponent UUID;
  v_match_id UUID;
  v_challenges UUID[];
  v_count INTEGER;
  v_difficulty public.difficulty_level;
  v_username TEXT;
  v_avatar TEXT;
  v_opponent_username TEXT;
  v_opponent_avatar TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_ID_REQUIRED';
  END IF;

  IF COALESCE(trim(p_region), '') = '' OR length(p_region) > 32 THEN
    RAISE EXCEPTION 'INVALID_REGION';
  END IF;

  IF COALESCE(p_difficulty, '') NOT IN ('easy', 'normal', 'hard') THEN
    RAISE EXCEPTION 'INVALID_DIFFICULTY';
  END IF;
  v_difficulty := p_difficulty::public.difficulty_level;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  -- Serialize the short queue-claim transaction so two simultaneous joins
  -- cannot each claim the other and then both create a match.
  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha:matchmaking:join', 0));

  SELECT mp.match_id INTO v_match_id
  FROM public.match_participants mp
  JOIN public.matches m ON m.id = mp.match_id
  WHERE mp.user_id = p_user_id
    AND m.mode = '1v1'
    AND m.status IN ('VS', 'ROUND_STARTING', 'ROUND_ACTIVE')
  ORDER BY mp.joined_at DESC
  LIMIT 1;

  IF v_match_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'matched', 'matchId', v_match_id, 'alreadyMatched', true);
  END IF;

  INSERT INTO public.matchmaking_queue(user_id, difficulty, region, skill_mmr, status, enqueued_at, joined_at, updated_at)
  VALUES (p_user_id, v_difficulty, p_region, 1000, 'queued', now(), now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET difficulty = EXCLUDED.difficulty,
        region = EXCLUDED.region,
        status = 'queued',
        skill_mmr = COALESCE(public.matchmaking_queue.skill_mmr, 1000),
        enqueued_at = CASE WHEN public.matchmaking_queue.status = 'queued'
                           THEN public.matchmaking_queue.enqueued_at ELSE now() END,
        joined_at = CASE WHEN public.matchmaking_queue.status = 'queued'
                         THEN public.matchmaking_queue.joined_at ELSE now() END,
        updated_at = now();

  SELECT q.user_id INTO v_opponent
  FROM public.matchmaking_queue q
  WHERE q.user_id <> p_user_id
    AND q.region = p_region
    AND q.status = 'queued'
    AND (q.difficulty = v_difficulty OR q.difficulty IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = q.user_id)
         OR (b.blocker_id = q.user_id AND b.blocked_id = p_user_id)
    )
  ORDER BY q.joined_at ASC, q.enqueued_at ASC
  FOR UPDATE OF q SKIP LOCKED
  LIMIT 1;

  IF v_opponent IS NULL THEN
    RETURN jsonb_build_object('status', 'queued');
  END IF;

  -- Select five approved, active, playable questions before creating anything.
  SELECT array_agg(candidate.id ORDER BY candidate.pick_order)
  INTO v_challenges
  FROM (
    SELECT c.id, row_number() OVER (ORDER BY random()) AS pick_order
    FROM public.challenges c
    WHERE c.active = true
      AND c.qa_status = 'approved'
      AND (
        EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id = c.id)
        OR EXISTS (
          SELECT 1 FROM public.challenge_choices cc
          WHERE cc.challenge_id = c.id
          GROUP BY cc.challenge_id
          HAVING count(*) >= 2 AND bool_or(cc.is_correct = true)
        )
        OR (
          c.letter_pool IS NOT NULL
          AND cardinality(c.letter_pool) > 0
          AND c.max_length IS NOT NULL
          AND c.max_length BETWEEN 1 AND cardinality(c.letter_pool)
        )
      )
    LIMIT 5
  ) candidate;

  v_count := COALESCE(cardinality(v_challenges), 0);
  IF v_count <> 5 THEN
    -- Keep both players queued; no half-created match and no lost opponent.
    RETURN jsonb_build_object('status', 'queued', 'reason', 'NOT_ENOUGH_PLAYABLE_CHALLENGES');
  END IF;

  SELECT username, avatar_url INTO v_username, v_avatar
  FROM public.profiles WHERE id = p_user_id;
  SELECT username, avatar_url INTO v_opponent_username, v_opponent_avatar
  FROM public.profiles WHERE id = v_opponent;

  INSERT INTO public.matches(
    mode, status, difficulty, current_round, total_rounds, sequence, server_now, started_at
  ) VALUES (
    '1v1', 'VS', v_difficulty, 1, 5, 1, now(), now()
  ) RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants(
    match_id, user_id, side, score, username, avatar_url, is_ai, state
  ) VALUES
    (v_match_id, p_user_id, 'player', 0, COALESCE(v_username, 'لاعب'), v_avatar, false, 'active'),
    (v_match_id, v_opponent, 'opponent', 0, COALESCE(v_opponent_username, 'لاعب'), v_opponent_avatar, false, 'active');

  INSERT INTO public.rounds(match_id, round_number, challenge_id, status, sequence)
  SELECT v_match_id, slot, v_challenges[slot], 'pending', 0
  FROM generate_series(1, 5) AS slot;

  UPDATE public.matchmaking_queue
  SET status = 'matched', updated_at = now()
  WHERE user_id IN (p_user_id, v_opponent);

  RETURN jsonb_build_object('status', 'matched', 'matchId', v_match_id, 'opponentId', v_opponent);
END;
$function$;

REVOKE ALL ON FUNCTION public.join_matchmaking_atomic(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_matchmaking_atomic(UUID, TEXT, TEXT) TO service_role;

COMMIT;
