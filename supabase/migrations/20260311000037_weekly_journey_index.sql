-- Weekly journey read path: keeps server-backed daily progress fast as cohorts grow.
CREATE INDEX IF NOT EXISTS idx_daily_completions_user_pack
  ON public.daily_pack_completions(user_id, pack_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_packs_active_date
  ON public.daily_packs(active, pack_date DESC);
