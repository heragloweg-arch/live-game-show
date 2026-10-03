-- Qaddaha content approval gate.
-- IMPORTANT: this migration intentionally activates ZERO imported questions.
-- It creates the auditable approval workflow used by the release operator.
-- 000041 imports inactive rows; 000042 prepares the letter contract; an operator
-- must insert approvals through the service-role workflow before activation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.challenge_content_approvals (
  challenge_id UUID PRIMARY KEY REFERENCES public.challenges(id) ON DELETE CASCADE,
  source_version INTEGER NOT NULL,
  cohort TEXT NOT NULL DEFAULT 'staging',
  factual_reviewed BOOLEAN NOT NULL DEFAULT false,
  wording_reviewed BOOLEAN NOT NULL DEFAULT false,
  religious_reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewer_id UUID REFERENCES public.profiles(id),
  reviewer_note TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cohort IN ('staging', 'internal', 'soft_launch', 'production')),
  CHECK (approved_at IS NULL OR (factual_reviewed AND wording_reviewed))
);

CREATE INDEX IF NOT EXISTS idx_challenge_content_approvals_release
  ON public.challenge_content_approvals(cohort, factual_reviewed, wording_reviewed, religious_reviewed, approved_at);

ALTER TABLE public.challenge_content_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.challenge_content_approvals FROM PUBLIC, anon, authenticated;

-- The release operator uses service_role only. No client can approve content.
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
SET search_path = public
AS $$
DECLARE
  v_subtype TEXT;
  v_version INTEGER;
BEGIN
  SELECT subtype, version INTO v_subtype, v_version
  FROM public.challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF v_version <> 41 THEN RAISE EXCEPTION 'unsupported_content_version'; END IF;
  IF p_cohort NOT IN ('staging', 'internal', 'soft_launch', 'production') THEN RAISE EXCEPTION 'invalid_cohort'; END IF;
  IF NOT p_factual_reviewed OR NOT p_wording_reviewed THEN RAISE EXCEPTION 'required_reviews_missing'; END IF;
  IF v_subtype = 'religion' AND NOT p_religious_reviewed THEN RAISE EXCEPTION 'religious_review_required'; END IF;

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
  WHERE id = p_challenge_id
    AND letter_pool IS NOT NULL
    AND cardinality(letter_pool) > 0
    AND EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id = p_challenge_id);

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_challenge_content(UUID, UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_challenge_content(UUID, UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) TO service_role;

-- Safety invariant: imported version 41 content remains disabled until the
-- service-role approval function is called per question.
UPDATE public.challenges
SET active = false,
    qa_status = 'needs_review',
    updated_at = now()
WHERE version = 41
  AND (active IS DISTINCT FROM false OR qa_status IS DISTINCT FROM 'needs_review');

COMMIT;
