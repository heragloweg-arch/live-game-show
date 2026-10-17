-- Forward repair: enforce the status contract missing from the initial queue migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.matchmaking_queue'::regclass
      AND conname = 'matchmaking_queue_status_check'
  ) THEN
    ALTER TABLE public.matchmaking_queue
      ADD CONSTRAINT matchmaking_queue_status_check
      CHECK (status IN ('queued', 'matched', 'cancelled')) NOT VALID;
  END IF;
END;
$$;
ALTER TABLE public.matchmaking_queue VALIDATE CONSTRAINT matchmaking_queue_status_check;
