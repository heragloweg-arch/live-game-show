-- Server-derived soft-launch metrics.
-- Client-provided aggregates are intentionally not accepted as the source of truth.
ALTER TABLE public.analytics_daily
  ADD COLUMN IF NOT EXISTS answers_submitted INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS answers_correct INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS answers_wrong INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_abandonments INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drop_rate NUMERIC(8,5) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'server';

ALTER TABLE public.analytics_daily
  DROP CONSTRAINT IF EXISTS analytics_daily_source_check;

ALTER TABLE public.analytics_daily
  ADD CONSTRAINT analytics_daily_source_check
  CHECK (source IN ('server', 'backfill'));

COMMENT ON COLUMN public.analytics_daily.source IS
  'Only server-derived or explicitly marked backfill rows are valid; client aggregates are rejected.';
