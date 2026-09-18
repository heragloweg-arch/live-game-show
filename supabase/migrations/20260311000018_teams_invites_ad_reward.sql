-- Teams foundation + 1v1 invites + ad reward claims + match invite tokens

-- Match mode team
DO $$ BEGIN
  ALTER TYPE public.match_mode ADD VALUE IF NOT EXISTS 'team';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  invite_code   TEXT NOT NULL UNIQUE,
  owner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  max_members   INT NOT NULL DEFAULT 5,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  team_id   UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.match_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user       UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,
  difficulty    TEXT NOT NULL DEFAULT 'normal',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  match_id      UUID REFERENCES public.matches(id),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_reward_claims (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  placement       TEXT NOT NULL,
  request_id      TEXT NOT NULL,
  coins_awarded   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_match_invites_token ON public.match_invites(token);
CREATE INDEX IF NOT EXISTS idx_teams_code ON public.teams(invite_code);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_reward_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_select ON public.teams FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = id AND tm.user_id = auth.uid())
);
CREATE POLICY team_members_select ON public.team_members FOR SELECT USING (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.team_members x WHERE x.team_id = team_members.team_id AND x.user_id = auth.uid()
  )
);
CREATE POLICY invites_select ON public.match_invites FOR SELECT USING (
  auth.uid() = from_user OR auth.uid() = to_user
);

REVOKE INSERT, UPDATE, DELETE ON public.ad_reward_claims FROM anon, authenticated;
REVOKE ALL ON public.ad_reward_claims FROM anon, authenticated;

-- Tournament format flag
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'single_elim'
    CHECK (format IN ('single_elim', 'round_robin'));
