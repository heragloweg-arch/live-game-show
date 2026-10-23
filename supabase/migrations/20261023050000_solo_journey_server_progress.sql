-- Server-authoritative Solo journey progress.
-- The client may cache progress for offline presentation, but completion is accepted here only once.
CREATE TABLE IF NOT EXISTS public.solo_journey_progress (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_number INT NOT NULL CHECK (branch_number BETWEEN 1 AND 6),
  leaf_number INT NOT NULL CHECK (leaf_number BETWEEN 1 AND 8),
  completion_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, branch_number, leaf_number)
);

CREATE INDEX IF NOT EXISTS idx_solo_journey_progress_user_order
  ON public.solo_journey_progress(user_id, branch_number, leaf_number);

ALTER TABLE public.solo_journey_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS solo_journey_progress_select_own ON public.solo_journey_progress;
CREATE POLICY solo_journey_progress_select_own
  ON public.solo_journey_progress FOR SELECT
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.solo_journey_progress FROM anon, authenticated;
GRANT SELECT ON public.solo_journey_progress TO authenticated;
GRANT ALL ON public.solo_journey_progress TO service_role;

CREATE OR REPLACE FUNCTION public.complete_solo_journey_leaf(
  p_user_id UUID,
  p_branch_number INT,
  p_leaf_number INT,
  p_match_id UUID
)
RETURNS TABLE(ok BOOLEAN, already_completed BOOLEAN, next_branch INT, next_leaf INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_match RECORD;
  v_inserted BOOLEAN := false;
  v_next_index INT;
BEGIN
  IF p_user_id IS NULL OR p_match_id IS NULL
     OR p_branch_number NOT BETWEEN 1 AND 6
     OR p_leaf_number NOT BETWEEN 1 AND 8 THEN
    RETURN QUERY SELECT false, false, NULL::INT, NULL::INT;
    RETURN;
  END IF;

  SELECT m.mode, m.status, m.config_snapshot
    INTO v_match
  FROM public.matches m
  WHERE m.id = p_match_id;

  IF NOT FOUND OR v_match.mode <> 'solo' OR v_match.status NOT IN ('MATCH_FINISHED', 'FINAL_RESULT') THEN
    RETURN QUERY SELECT false, false, NULL::INT, NULL::INT;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.match_participants mp
    WHERE mp.match_id = p_match_id AND mp.user_id = p_user_id AND mp.is_ai = false
  ) THEN
    RETURN QUERY SELECT false, false, NULL::INT, NULL::INT;
    RETURN;
  END IF;

  IF COALESCE((v_match.config_snapshot->>'journeyBranch')::INT, 0) <> p_branch_number
     OR COALESCE((v_match.config_snapshot->>'journeyLeaf')::INT, 0) <> p_leaf_number THEN
    RETURN QUERY SELECT false, false, NULL::INT, NULL::INT;
    RETURN;
  END IF;

  IF p_branch_number <> 1 OR p_leaf_number <> 1 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.solo_journey_progress prev
      WHERE prev.user_id = p_user_id
        AND (prev.branch_number * 8 + prev.leaf_number) = (p_branch_number * 8 + p_leaf_number - 1)
    ) THEN
      RETURN QUERY SELECT false, false, NULL::INT, NULL::INT;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.solo_journey_progress(user_id, branch_number, leaf_number, completion_match_id)
  VALUES (p_user_id, p_branch_number, p_leaf_number, p_match_id)
  ON CONFLICT (user_id, branch_number, leaf_number) DO NOTHING;
  v_inserted := FOUND;

  v_next_index := p_branch_number * 8 + p_leaf_number + 1;
  RETURN QUERY SELECT
    true,
    NOT v_inserted,
    CASE WHEN v_next_index <= 48 THEN ((v_next_index - 1) / 8) ELSE NULL END,
    CASE WHEN v_next_index <= 48 THEN (((v_next_index - 1) % 8) + 1) ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_solo_journey_leaf(UUID, INT, INT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_solo_journey_leaf(UUID, INT, INT, UUID) TO service_role;
