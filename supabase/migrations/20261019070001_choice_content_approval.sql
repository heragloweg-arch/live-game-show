-- Extend the service-role content approval gate to multiple-choice challenges.
-- Imported and authored content remains inactive until approve_challenge_content is called.
BEGIN;

CREATE OR REPLACE FUNCTION public.approve_challenge_content(
  p_challenge_id UUID,
  p_reviewer_id UUID,
  p_cohort TEXT,
  p_factual_reviewed BOOLEAN,
  p_wording_reviewed BOOLEAN,
  p_religious_reviewed BOOLEAN,
  p_reviewer_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_subtype TEXT;
  v_version INTEGER;
  v_has_playable_contract BOOLEAN;
BEGIN
  SELECT subtype, version INTO v_subtype, v_version
  FROM public.challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF v_version <> 41 THEN RAISE EXCEPTION 'unsupported_content_version'; END IF;
  IF p_cohort NOT IN ('staging', 'internal', 'soft_launch', 'production') THEN RAISE EXCEPTION 'invalid_cohort'; END IF;
  IF NOT p_factual_reviewed OR NOT p_wording_reviewed THEN RAISE EXCEPTION 'required_reviews_missing'; END IF;
  IF v_subtype = 'religion' AND NOT p_religious_reviewed THEN RAISE EXCEPTION 'religious_review_required'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.challenge_choices c
    WHERE c.challenge_id = p_challenge_id
    GROUP BY c.challenge_id
    HAVING count(*) >= 2 AND bool_or(c.is_correct)
  ) OR EXISTS (
    SELECT 1 FROM public.challenge_answers a
    WHERE a.challenge_id = p_challenge_id
  ) AND EXISTS (
    SELECT 1 FROM public.challenges c
    WHERE c.id = p_challenge_id AND c.letter_pool IS NOT NULL AND cardinality(c.letter_pool) > 0
  ) INTO v_has_playable_contract;

  IF NOT v_has_playable_contract THEN RAISE EXCEPTION 'playable_answer_contract_missing'; END IF;

  INSERT INTO public.challenge_content_approvals (
    challenge_id, source_version, cohort, factual_reviewed, wording_reviewed,
    religious_reviewed, reviewer_id, reviewer_note, approved_at, updated_at
  ) VALUES (
    p_challenge_id, v_version, p_cohort, p_factual_reviewed, p_wording_reviewed,
    p_religious_reviewed, p_reviewer_id, p_reviewer_note, now(), now()
  )
  ON CONFLICT (challenge_id) DO UPDATE SET
    source_version = EXCLUDED.source_version,
    cohort = EXCLUDED.cohort,
    factual_reviewed = EXCLUDED.factual_reviewed,
    wording_reviewed = EXCLUDED.wording_reviewed,
    religious_reviewed = EXCLUDED.religious_reviewed,
    reviewer_id = EXCLUDED.reviewer_id,
    reviewer_note = EXCLUDED.reviewer_note,
    approved_at = EXCLUDED.approved_at,
    updated_at = now();

  UPDATE public.challenges
  SET active = true,
      qa_status = 'approved',
      reviewed_at = now(),
      reviewed_by = p_reviewer_id,
      updated_at = now()
  WHERE id = p_challenge_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_challenge_content(UUID, UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_challenge_content(UUID, UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) TO service_role;

COMMIT;
