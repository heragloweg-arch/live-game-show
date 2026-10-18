-- Batch 2: one server-side transaction owns round close and match advance.
-- This migration is intentionally not applied to Production from the repository.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS ai_score_applied BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.advance_match_round(
  p_match_id UUID,
  p_expected_round INTEGER,
  p_ai_score_delta INTEGER DEFAULT 0
)
RETURNS TABLE (
  ok BOOLEAN,
  code TEXT,
  round_id UUID,
  current_round INTEGER,
  status public.match_status,
  sequence INTEGER,
  advanced BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_human_count INTEGER;
  v_submission_count INTEGER;
  v_next_round INTEGER;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_ai_delta INTEGER := LEAST(GREATEST(COALESCE(p_ai_score_delta, 0), 0), 1000);
BEGIN
  IF p_match_id IS NULL OR p_expected_round IS NULL THEN
    RETURN QUERY SELECT false, 'INVALID_ARGUMENT', NULL::UUID, NULL::INTEGER,
      NULL::public.match_status, NULL::INTEGER, false;
    RETURN;
  END IF;

  -- Match is the outer lock. Every caller then locks the current round.
  -- This ordering prevents two clients from closing the same round concurrently.
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'MATCH_NOT_FOUND', NULL::UUID, NULL::INTEGER,
      NULL::public.match_status, NULL::INTEGER, false;
    RETURN;
  END IF;

  IF v_match.status IN ('MATCH_FINISHED', 'FINAL_RESULT', 'MATCH_TERMINATED') THEN
    RETURN QUERY SELECT false, 'MATCH_FINISHED', NULL::UUID, v_match.current_round,
      v_match.status, v_match.sequence, false;
    RETURN;
  END IF;

  IF v_match.current_round <> p_expected_round THEN
    RETURN QUERY SELECT false, 'STALE_ROUND', NULL::UUID, v_match.current_round,
      v_match.status, v_match.sequence, false;
    RETURN;
  END IF;

  SELECT * INTO v_round
  FROM public.rounds
  WHERE match_id = p_match_id AND round_number = p_expected_round
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'ROUND_NOT_FOUND', NULL::UUID, v_match.current_round,
      v_match.status, v_match.sequence, false;
    RETURN;
  END IF;

  IF v_round.status = 'finished' THEN
    RETURN QUERY SELECT false, 'ROUND_ALREADY_FINISHED', v_round.id, v_match.current_round,
      v_match.status, v_match.sequence, false;
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_human_count
  FROM public.match_participants
  WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false AND user_id IS NOT NULL;

  SELECT COUNT(DISTINCT user_id)::INTEGER INTO v_submission_count
  FROM public.answer_submissions
  WHERE round_id = v_round.id AND user_id IS NOT NULL;

  IF (v_round.server_end_at IS NULL OR v_round.server_end_at > v_now)
     AND v_submission_count < v_human_count THEN
    RETURN QUERY SELECT false, 'ROUND_NOT_READY', v_round.id, v_match.current_round,
      v_match.status, v_match.sequence, false;
    RETURN;
  END IF;

  -- The Edge Function computes the deterministic AI delta; this marker makes
  -- applying it idempotent when the client retries the same transition.
  IF NOT COALESCE(v_round.ai_score_applied, false)
     AND EXISTS (
       SELECT 1 FROM public.match_participants
       WHERE match_id = p_match_id AND COALESCE(is_ai, false) = true
     ) THEN
    UPDATE public.match_participants
    SET score = score + v_ai_delta
    WHERE match_id = p_match_id AND COALESCE(is_ai, false) = true;

    UPDATE public.rounds
    SET ai_score_applied = true
    WHERE id = v_round.id;
  END IF;

  UPDATE public.rounds
  SET status = 'finished', sequence = sequence + 1
  WHERE id = v_round.id;

  v_next_round := v_match.current_round + 1;
  IF v_next_round > v_match.total_rounds THEN
    UPDATE public.matches
    SET status = 'MATCH_FINISHED',
        sequence = sequence + 1,
        server_now = v_now,
        ended_at = COALESCE(ended_at, v_now)
    WHERE id = p_match_id;

    RETURN QUERY SELECT true, 'MATCH_FINISHED', v_round.id, v_match.current_round + 1,
      'MATCH_FINISHED'::public.match_status, v_match.sequence + 1, true;
    RETURN;
  END IF;

  UPDATE public.matches
  SET current_round = v_next_round,
      status = 'ROUND_STARTING',
      sequence = sequence + 1,
      server_now = v_now
  WHERE id = p_match_id;

  RETURN QUERY SELECT true, 'ADVANCED', v_round.id, v_next_round,
    'ROUND_STARTING'::public.match_status, v_match.sequence + 1, true;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_match_round(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_match_round(UUID, INTEGER, INTEGER)
  TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rounds'
      AND column_name = 'ai_score_applied'
  ) THEN
    RAISE EXCEPTION 'Batch 2 assertion failed: rounds.ai_score_applied is missing';
  END IF;

  IF has_function_privilege('anon', 'public.advance_match_round(uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.advance_match_round(uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Batch 2 assertion failed: client roles can execute advance_match_round';
  END IF;
END $$;
