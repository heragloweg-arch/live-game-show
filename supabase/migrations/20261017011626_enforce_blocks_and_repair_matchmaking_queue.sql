-- Applied on production 2026-10-17; version retained to match Supabase migration ledger.
ALTER TABLE public.matchmaking_queue
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.matchmaking_queue
SET status = 'queued'
WHERE status IS NULL OR status NOT IN ('queued', 'matched', 'cancelled');

UPDATE public.matchmaking_queue
SET joined_at = enqueued_at
WHERE joined_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_status_region_joined
  ON public.matchmaking_queue(status, region, joined_at);

DROP FUNCTION IF EXISTS public.claim_matchmaking_opponent(UUID, TEXT);
DROP FUNCTION IF EXISTS public.claim_matchmaking_opponent(UUID, TEXT, TEXT);

CREATE FUNCTION public.claim_matchmaking_opponent(
  p_user_id UUID,
  p_region TEXT,
  p_difficulty TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_opponent UUID;
BEGIN
  SELECT q.user_id INTO v_opponent
  FROM public.matchmaking_queue AS q
  WHERE q.user_id <> p_user_id
    AND q.region = p_region
    AND q.status = 'queued'
    AND (q.difficulty::TEXT = p_difficulty OR p_difficulty IS NULL)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks AS b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = q.user_id)
         OR (b.blocker_id = q.user_id AND b.blocked_id = p_user_id)
    )
  ORDER BY q.joined_at ASC, q.enqueued_at ASC
  FOR UPDATE OF q SKIP LOCKED
  LIMIT 1;

  IF v_opponent IS NULL THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.matchmaking_queue
  WHERE user_id IN (p_user_id, v_opponent);

  RETURN v_opponent;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_matchmaking_opponent(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_matchmaking_opponent(UUID, TEXT, TEXT) TO service_role;
