-- Daily Challenge + Streak system

CREATE TABLE IF NOT EXISTS public.daily_challenges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_date  DATE NOT NULL UNIQUE,
  challenge_id    UUID NOT NULL REFERENCES public.challenges(id),
  bonus_coins     INT NOT NULL DEFAULT 40,
  bonus_xp        INT NOT NULL DEFAULT 35,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_date  DATE NOT NULL,
  outcome         answer_outcome NOT NULL,
  points          INT NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_date)
);

CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id           UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak    INT NOT NULL DEFAULT 0,
  longest_streak    INT NOT NULL DEFAULT 0,
  last_daily_date   DATE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_completions_user ON public.daily_completions(user_id, challenge_date DESC);

ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_challenges_select ON public.daily_challenges FOR SELECT USING (true);
CREATE POLICY daily_completions_select ON public.daily_completions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY daily_completions_insert ON public.daily_completions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_streaks_select ON public.user_streaks FOR SELECT USING (auth.uid() = user_id);

-- Onboarding flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN NOT NULL DEFAULT false;
