-- P1: room answers server-only + atomic answer submit + atomic daily

DROP POLICY IF EXISTS room_answers_insert ON public.room_answers;
REVOKE INSERT, UPDATE, DELETE ON public.room_answers FROM anon, authenticated;
GRANT SELECT ON public.room_answers TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_answer_atomic(
  p_request_id TEXT,
  p_match_id UUID,
  p_round_id UUID,
  p_user_id UUID,
  p_answer TEXT,
  p_normalized TEXT,
  p_outcome TEXT,
  p_points INT,
  p_bonus INT,
  p_response_time_ms INT DEFAULT NULL,
  p_client_timestamp TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_id UUID;
BEGIN
  SELECT * INTO v_existing FROM public.answer_submissions WHERE request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'duplicate', true,
      'requestId', v_existing.request_id,
      'outcome', v_existing.outcome,
      'points', v_existing.points,
      'bonus', v_existing.bonus
    );
  END IF;

  SELECT * INTO v_existing FROM public.answer_submissions
  WHERE round_id = p_round_id AND user_id = p_user_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'duplicate', true,
      'requestId', v_existing.request_id,
      'outcome', v_existing.outcome,
      'points', v_existing.points,
      'bonus', v_existing.bonus
    );
  END IF;

  INSERT INTO public.answer_submissions (
    request_id, match_id, round_id, user_id, answer, normalized_answer,
    outcome, points, bonus, response_time_ms, client_timestamp, server_validated_at
  ) VALUES (
    p_request_id, p_match_id, p_round_id, p_user_id, p_answer, p_normalized,
    p_outcome, p_points, p_bonus, p_response_time_ms, p_client_timestamp, now()
  )
  ON CONFLICT (round_id, user_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT * INTO v_existing FROM public.answer_submissions
    WHERE round_id = p_round_id AND user_id = p_user_id;
    RETURN jsonb_build_object(
      'duplicate', true,
      'requestId', v_existing.request_id,
      'outcome', v_existing.outcome,
      'points', v_existing.points,
      'bonus', v_existing.bonus
    );
  END IF;

  -- Score participant
  UPDATE public.match_participants
  SET score = COALESCE(score, 0) + p_points + COALESCE(p_bonus, 0)
  WHERE match_id = p_match_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'requestId', p_request_id,
    'outcome', p_outcome,
    'points', p_points,
    'bonus', p_bonus
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_answer_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_answer_atomic TO service_role;
