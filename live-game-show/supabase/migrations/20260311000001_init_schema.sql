-- ═══════════════════════════════════════════════════════════════
-- زتونة — Database Schema v1.0
-- Server-Authoritative · PostgreSQL (Supabase)
-- ═══════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- Profiles (extends auth.users)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  level         INT NOT NULL DEFAULT 1,
  xp            INT NOT NULL DEFAULT 0,
  xp_to_next    INT NOT NULL DEFAULT 100,
  wins          INT NOT NULL DEFAULT 0,
  losses        INT NOT NULL DEFAULT 0,
  total_matches INT NOT NULL DEFAULT 0,
  coins         INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_level ON public.profiles(level DESC);

-- ─────────────────────────────────────────────
-- Challenges Bank
-- ─────────────────────────────────────────────
CREATE TYPE challenge_type AS ENUM ('speed', 'words', 'knowledge', 'mystery');
CREATE TYPE challenge_subtype AS ENUM (
  'letters', 'movies', 'countries', 'people', 'emoji',
  'autobus', 'complete_sentence', 'proverb', 'wisdom', 'related_words',
  'general', 'geography', 'history', 'religion', 'science', 'sports', 'art', 'cooking'
);
CREATE TYPE difficulty_level AS ENUM ('easy', 'normal', 'hard');

CREATE TABLE IF NOT EXISTS public.challenges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          challenge_type NOT NULL,
  subtype       challenge_subtype NOT NULL,
  prompt        TEXT NOT NULL,
  difficulty    difficulty_level NOT NULL DEFAULT 'normal',
  time_limit_ms INT NOT NULL DEFAULT 15000,
  letter_pool   TEXT[],
  max_length    INT,
  version       INT NOT NULL DEFAULT 1,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenges_type ON public.challenges(type) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_challenges_difficulty ON public.challenges(difficulty) WHERE active = true;

-- Accepted answers (closed list — server only)
CREATE TABLE IF NOT EXISTS public.challenge_answers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id      UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  accepted_answer   TEXT NOT NULL,
  normalized_answer TEXT NOT NULL,
  UNIQUE (challenge_id, normalized_answer)
);

CREATE INDEX IF NOT EXISTS idx_challenge_answers_challenge ON public.challenge_answers(challenge_id);

-- Multiple choice options (correctness never sent to client)
CREATE TABLE IF NOT EXISTS public.challenge_choices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id  UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  choice_id     TEXT NOT NULL,
  label         TEXT NOT NULL,
  is_correct    BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (challenge_id, choice_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_choices_challenge ON public.challenge_choices(challenge_id);

-- ─────────────────────────────────────────────
-- Matches
-- ─────────────────────────────────────────────
CREATE TYPE match_mode AS ENUM ('solo', '1v1', 'room', 'host');
CREATE TYPE match_status AS ENUM (
  'IDLE', 'MATCHMAKING', 'MATCH_FOUND', 'VS',
  'ROUND_STARTING', 'ROUND_ACTIVE', 'ANSWER_SUBMITTED',
  'ROUND_RESULT', 'NEXT_ROUND', 'MATCH_FINISHED', 'FINAL_RESULT',
  'CONNECTION_LOST', 'RECONNECTING', 'MATCH_TERMINATED'
);

CREATE TABLE IF NOT EXISTS public.matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode            match_mode NOT NULL,
  status          match_status NOT NULL DEFAULT 'IDLE',
  difficulty      difficulty_level DEFAULT 'normal',
  current_round   INT NOT NULL DEFAULT 0,
  total_rounds    INT NOT NULL DEFAULT 5,
  sequence        INT NOT NULL DEFAULT 0,
  winner_id       UUID REFERENCES public.profiles(id),
  config_snapshot JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  server_now      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_mode ON public.matches(mode);
CREATE INDEX IF NOT EXISTS idx_matches_created ON public.matches(created_at DESC);

-- ─────────────────────────────────────────────
-- Match Participants
-- ─────────────────────────────────────────────
CREATE TYPE participant_side AS ENUM ('player', 'opponent', 'ai', 'host', 'team_a', 'team_b');

CREATE TABLE IF NOT EXISTS public.match_participants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.profiles(id),
  side        participant_side NOT NULL,
  score       INT NOT NULL DEFAULT 0,
  is_ai       BOOLEAN NOT NULL DEFAULT false,
  ai_difficulty difficulty_level,
  username    TEXT NOT NULL,
  avatar_url  TEXT,
  state       TEXT DEFAULT 'active',
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_participants_match ON public.match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_user ON public.match_participants(user_id);

-- ─────────────────────────────────────────────
-- Rounds
-- ─────────────────────────────────────────────
CREATE TYPE round_status AS ENUM ('pending', 'active', 'finished');

CREATE TABLE IF NOT EXISTS public.rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  round_number    INT NOT NULL,
  challenge_id    UUID NOT NULL REFERENCES public.challenges(id),
  status          round_status NOT NULL DEFAULT 'pending',
  server_start_at TIMESTAMPTZ,
  server_end_at   TIMESTAMPTZ,
  sequence        INT NOT NULL DEFAULT 0,
  UNIQUE (match_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_rounds_match ON public.rounds(match_id);

-- ─────────────────────────────────────────────
-- Answer Submissions (idempotent)
-- ─────────────────────────────────────────────
CREATE TYPE answer_outcome AS ENUM ('correct', 'wrong', 'timeout', 'invalid');

CREATE TABLE IF NOT EXISTS public.answer_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          TEXT NOT NULL UNIQUE,
  match_id            UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  round_id            UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id),
  answer              TEXT NOT NULL,
  normalized_answer   TEXT,
  outcome             answer_outcome NOT NULL,
  points              INT NOT NULL DEFAULT 0,
  bonus               INT NOT NULL DEFAULT 0,
  response_time_ms    INT,
  client_timestamp    TIMESTAMPTZ,
  server_validated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_answers_match ON public.answer_submissions(match_id);
CREATE INDEX IF NOT EXISTS idx_answers_round ON public.answer_submissions(round_id);
CREATE INDEX IF NOT EXISTS idx_answers_request ON public.answer_submissions(request_id);

-- ─────────────────────────────────────────────
-- Matchmaking Queue
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  difficulty  difficulty_level DEFAULT 'normal',
  region      TEXT DEFAULT 'mena',
  skill_mmr   INT NOT NULL DEFAULT 1000,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mm_queue_enqueued ON public.matchmaking_queue(enqueued_at);

-- ─────────────────────────────────────────────
-- Rooms (Host / Live)
-- ─────────────────────────────────────────────
CREATE TYPE room_status AS ENUM ('waiting', 'live', 'ended');

CREATE TABLE IF NOT EXISTS public.rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  host_id         UUID NOT NULL REFERENCES public.profiles(id),
  title           TEXT NOT NULL DEFAULT 'تحدي زتونة',
  status          room_status NOT NULL DEFAULT 'waiting',
  max_participants INT NOT NULL DEFAULT 20,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON public.rooms(host_id);

CREATE TABLE IF NOT EXISTS public.room_participants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id),
  is_host     BOOLEAN NOT NULL DEFAULT false,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

-- ─────────────────────────────────────────────
-- XP Events
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.xp_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id),
  source      TEXT NOT NULL,
  amount      INT NOT NULL,
  match_id    UUID REFERENCES public.matches(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_user ON public.xp_events(user_id);

-- ─────────────────────────────────────────────
-- Updated_at trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER challenges_updated_at
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- Auto-create profile on signup
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'player_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'لاعب زتونة')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────
-- RLS Policies (basic — tighten in production)
-- ─────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

-- Profiles: public read, own write
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Challenges: public read active only (answers/choices hidden from client via views or functions)
CREATE POLICY challenges_select ON public.challenges FOR SELECT USING (active = true);

-- Matches: participants can read
CREATE POLICY matches_select ON public.matches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = id AND mp.user_id = auth.uid()
    )
  );

-- Answer submissions: own only
CREATE POLICY answers_select ON public.answer_submissions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY answers_insert ON public.answer_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Matchmaking: own row
CREATE POLICY mm_select ON public.matchmaking_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY mm_insert ON public.matchmaking_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY mm_delete ON public.matchmaking_queue FOR DELETE USING (auth.uid() = user_id);

-- Rooms
CREATE POLICY rooms_select ON public.rooms FOR SELECT USING (true);
CREATE POLICY rooms_insert ON public.rooms FOR INSERT WITH CHECK (auth.uid() = host_id);
