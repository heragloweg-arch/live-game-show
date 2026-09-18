-- Couple co-op match mode
DO $$ BEGIN
  ALTER TYPE public.match_mode ADD VALUE IF NOT EXISTS 'couple';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS couple_id UUID REFERENCES public.couples(id) ON DELETE SET NULL;

ALTER TABLE public.couples
  ADD COLUMN IF NOT EXISTS last_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matches_couple ON public.matches(couple_id) WHERE couple_id IS NOT NULL;
