-- Cosmetic inventory and cohort attribution: monetizes expression, never power.
CREATE TABLE IF NOT EXISTS public.cosmetic_catalog (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('frame', 'title', 'theme', 'emote')),
  title TEXT NOT NULL,
  price_coins INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.user_cosmetics (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cosmetic_id TEXT NOT NULL REFERENCES public.cosmetic_catalog(id),
  equipped BOOLEAN NOT NULL DEFAULT false,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, cosmetic_id)
);
CREATE TABLE IF NOT EXISTS public.user_cohorts (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  cohort_key TEXT NOT NULL,
  source TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cosmetic_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cohorts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cosmetic_catalog_select ON public.cosmetic_catalog;
CREATE POLICY cosmetic_catalog_select ON public.cosmetic_catalog FOR SELECT USING (active = true);
DROP POLICY IF EXISTS user_cosmetics_select ON public.user_cosmetics;
CREATE POLICY user_cosmetics_select ON public.user_cosmetics FOR SELECT USING (auth.uid() = user_id);
INSERT INTO public.cosmetic_catalog(id, kind, title, price_coins, metadata) VALUES
 ('frame_sunset','frame','إطار الغروب',250,'{"accent":"#f97316"}'),
 ('title_speedster','title','صائد السرعة',500,'{"rarity":"rare"}'),
 ('emote_fire','emote','شرارة الفوز',350,'{"animation":"fire"}')
ON CONFLICT(id) DO NOTHING;
