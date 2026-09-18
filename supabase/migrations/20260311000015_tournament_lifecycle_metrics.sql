-- Tournament full lifecycle after final + investor metrics snapshots

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS champion_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS runner_up_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS prizes_distributed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS season_label TEXT,
  ADD COLUMN IF NOT EXISTS next_tournament_id UUID REFERENCES public.tournaments(id);

-- Prize ledger rows are via wallet_ledger type tournament_prize

CREATE TABLE IF NOT EXISTS public.analytics_daily (
  day           DATE PRIMARY KEY,
  dau           INT NOT NULL DEFAULT 0,
  matches_started INT NOT NULL DEFAULT 0,
  matches_finished INT NOT NULL DEFAULT 0,
  ad_impressions INT NOT NULL DEFAULT 0,
  revenue_micros BIGINT NOT NULL DEFAULT 0,
  new_users     INT NOT NULL DEFAULT 0,
  notes         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.investor_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_snapshots ENABLE ROW LEVEL SECURITY;
-- readable by authenticated for soft-launch internal dashboard (tighten later to admin role)
CREATE POLICY analytics_daily_select ON public.analytics_daily FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY investor_snapshots_select ON public.investor_snapshots FOR SELECT USING (auth.role() = 'authenticated');
