-- Server-derived answer quality metrics for content monitoring.
ALTER TABLE public.analytics_daily
  ADD COLUMN IF NOT EXISTS p_correct NUMERIC(8,5) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS median_response_ms INT;
