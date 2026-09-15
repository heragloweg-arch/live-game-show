-- ═══════════════════════════════════════════════════════════════
-- Production Hardening — Security + Atomic Match + Matchmaking
-- Sprint 1–3 foundations
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. LOCK answer tables (CRITICAL) ─────────────────────────
-- Clients must NEVER read answers/choices. Only service role (Edge).

ALTER TABLE public.challenge_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_choices ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for authenticated/anon
-- Service role bypasses RLS by design.

DROP POLICY IF EXISTS challenge_answers_deny ON public.challenge_answers;
DROP POLICY IF EXISTS challenge_choices_deny ON public.challenge_choices;

-- Explicit deny for authenticated (defense in depth; no policy = deny for non-service)
-- Revoke grants if any were given
REVOKE ALL ON public.challenge_answers FROM anon, authenticated;
REVOKE ALL ON public.challenge_choices FROM anon, authenticated;
GRANT ALL ON public.challenge_answers TO service_role;
GRANT ALL ON public.challenge_choices TO service_role;

-- Challenges public: strip nothing from table; Edge should not return is_correct
-- Ensure clients cannot update challenges
DROP POLICY IF EXISTS challenges_update ON public.challenges;
DROP POLICY IF EXISTS challenges_insert ON public.challenges;
DROP POLICY IF EXISTS challenges_delete ON public.challenges;

-- ─── 2. Rounds: participants read only; no client writes ───────
DROP POLICY IF EXISTS rounds_select ON public.rounds;
CREATE POLICY rounds_select ON public.rounds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = rounds.match_id AND mp.user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.rounds FROM anon, authenticated;

-- ─── 3. match_participants read for participants of same match ─
DROP POLICY IF EXISTS match_participants_select ON public.match_participants;
CREATE POLICY match_participants_select ON public.match_participants FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.match_participants me
      WHERE me.match_id = match_participants.match_id AND me.user_id = auth.uid()
    )
  );

-- ─── 4. Atomic matchmaking claim (row lock) ───────────────────
CREATE OR REPLACE FUNCTION public.claim_matchmaking_opponent(
  p_user_id UUID,
  p_region TEXT DEFAULT 'mena',
  p_difficulty TEXT DEFAULT 'normal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opponent UUID;
BEGIN
  -- Lock one waiting opponent
  SELECT user_id INTO v_opponent
  FROM public.matchmaking_queue
  WHERE user_id <> p_user_id
    AND region = p_region
  ORDER BY enqueued_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_opponent IS NULL THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.matchmaking_queue WHERE user_id IN (p_user_id, v_opponent);
  RETURN v_opponent;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_matchmaking_opponent FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_matchmaking_opponent TO service_role;

-- ─── 5. Atomic round start (only from pending) ────────────────
CREATE OR REPLACE FUNCTION public.atomic_start_round(
  p_match_id UUID,
  p_round_number INT
)
RETURNS TABLE (
  ok BOOLEAN,
  round_id UUID,
  server_start_at TIMESTAMPTZ,
  server_end_at TIMESTAMPTZ,
  already_started BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round RECORD;
  v_start TIMESTAMPTZ := now();
  v_end TIMESTAMPTZ;
  v_limit INT;
  v_seq INT;
BEGIN
  SELECT r.*, c.time_limit_ms
  INTO v_round
  FROM public.rounds r
  LEFT JOIN public.challenges c ON c.id = r.challenge_id
  WHERE r.match_id = p_match_id AND r.round_number = p_round_number
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, false;
    RETURN;
  END IF;

  IF v_round.status = 'active' OR v_round.status = 'finished' THEN
    RETURN QUERY SELECT true, v_round.id, v_round.server_start_at, v_round.server_end_at, true;
    RETURN;
  END IF;

  IF v_round.status <> 'pending' THEN
    RETURN QUERY SELECT false, v_round.id, v_round.server_start_at, v_round.server_end_at, false;
    RETURN;
  END IF;

  v_limit := COALESCE(v_round.time_limit_ms, 15000);
  v_end := v_start + (v_limit || ' milliseconds')::INTERVAL;

  SELECT sequence INTO v_seq FROM public.matches WHERE id = p_match_id FOR UPDATE;
  v_seq := COALESCE(v_seq, 0) + 1;

  UPDATE public.rounds
  SET status = 'active',
      server_start_at = v_start,
      server_end_at = v_end,
      sequence = v_seq
  WHERE id = v_round.id AND status = 'pending';

  IF NOT FOUND THEN
    -- concurrent start won
    SELECT r.server_start_at, r.server_end_at INTO v_start, v_end FROM public.rounds r WHERE r.id = v_round.id;
    RETURN QUERY SELECT true, v_round.id, v_start, v_end, true;
    RETURN;
  END IF;

  UPDATE public.matches
  SET status = 'ROUND_ACTIVE',
      sequence = v_seq,
      server_now = v_start,
      started_at = COALESCE(started_at, v_start)
  WHERE id = p_match_id;

  RETURN QUERY SELECT true, v_round.id, v_start, v_end, false;
END;
$$;

REVOKE ALL ON FUNCTION public.atomic_start_round FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atomic_start_round TO service_role;

-- ─── 6. Count submissions for round completion gate ───────────
CREATE OR REPLACE FUNCTION public.round_submission_count(p_round_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT FROM public.answer_submissions WHERE round_id = p_round_id;
$$;

GRANT EXECUTE ON FUNCTION public.round_submission_count TO service_role;

-- ─── 7. Human participant count ───────────────────────────────
CREATE OR REPLACE FUNCTION public.match_human_count(p_match_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT FROM public.match_participants
  WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false;
$$;

GRANT EXECUTE ON FUNCTION public.match_human_count TO service_role;
