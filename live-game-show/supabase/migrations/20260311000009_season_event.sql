-- Simple season / weekly event foundation
CREATE TABLE IF NOT EXISTS public.seasons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  reward_title  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.season_scores (
  season_id     UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points        INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY seasons_select ON public.seasons FOR SELECT USING (true);
CREATE POLICY season_scores_select ON public.season_scores FOR SELECT USING (true);

INSERT INTO public.seasons (slug, title, starts_at, ends_at, reward_title)
VALUES (
  'soft-launch-s1',
  'موسم الإطلاق الهادئ',
  now(),
  now() + interval '28 days',
  'رائد زتونة'
)
ON CONFLICT (slug) DO NOTHING;
