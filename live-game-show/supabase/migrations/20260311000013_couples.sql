-- Couples mode — shared bond, invite code, co-op stats
CREATE TABLE IF NOT EXISTS public.couples (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code     TEXT NOT NULL UNIQUE,
  user_a          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'dissolved')),
  shared_wins     INT NOT NULL DEFAULT 0,
  shared_matches  INT NOT NULL DEFAULT 0,
  streak_days     INT NOT NULL DEFAULT 0,
  last_played_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_couples_user_a ON public.couples(user_a);
CREATE INDEX IF NOT EXISTS idx_couples_user_b ON public.couples(user_b);
CREATE INDEX IF NOT EXISTS idx_couples_code ON public.couples(invite_code);

ALTER TABLE public.couples ENABLE ROW LEVEL SECURITY;
CREATE POLICY couples_select ON public.couples FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);
