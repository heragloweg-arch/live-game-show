-- Teams match (1–15 per side) + Creator foundation

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS max_members INT NOT NULL DEFAULT 5;

-- Allow up to 15
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_max_members_check;
ALTER TABLE public.teams ADD CONSTRAINT teams_max_members_check CHECK (max_members >= 1 AND max_members <= 15);

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS team_size INT,
  ADD COLUMN IF NOT EXISTS team_a_id UUID REFERENCES public.teams(id),
  ADD COLUMN IF NOT EXISTS team_b_id UUID REFERENCES public.teams(id);

-- Creator
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_creator BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS creator_bio TEXT;

CREATE TABLE IF NOT EXISTS public.creator_challenges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            public.challenge_type NOT NULL DEFAULT 'knowledge',
  subtype         TEXT,
  prompt          TEXT NOT NULL,
  difficulty      public.difficulty_level NOT NULL DEFAULT 'normal',
  time_limit_ms   INT NOT NULL DEFAULT 12000,
  letter_pool     TEXT[],
  accepted_answers TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  published_challenge_id UUID REFERENCES public.challenges(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creator_challenges_creator ON public.creator_challenges(creator_id);

ALTER TABLE public.creator_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY creator_challenges_own ON public.creator_challenges
  FOR ALL USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

-- Team queue for matchmaking team vs team
CREATE TABLE IF NOT EXISTS public.team_match_queue (
  team_id       UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES public.profiles(id),
  team_size     INT NOT NULL DEFAULT 5 CHECK (team_size BETWEEN 1 AND 15),
  difficulty    public.difficulty_level NOT NULL DEFAULT 'normal',
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'matched', 'cancelled')),
  match_id      UUID REFERENCES public.matches(id),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_match_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_queue_own ON public.team_match_queue
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Pickup seats for solo players filling team slots
CREATE TABLE IF NOT EXISTS public.team_pickup_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  desired_size  INT NOT NULL DEFAULT 5 CHECK (desired_size BETWEEN 1 AND 15),
  difficulty    public.difficulty_level NOT NULL DEFAULT 'normal',
  status        TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'assigned', 'cancelled')),
  team_id       UUID REFERENCES public.teams(id),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.team_pickup_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_pickup_own ON public.team_pickup_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
