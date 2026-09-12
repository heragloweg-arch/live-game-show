-- Live room challenges: host pushes questions, participants answer

CREATE TYPE room_round_status AS ENUM ('pending', 'active', 'revealed', 'closed');

CREATE TABLE IF NOT EXISTS public.room_rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  challenge_id    UUID NOT NULL REFERENCES public.challenges(id),
  round_number    INT NOT NULL DEFAULT 1,
  status          room_round_status NOT NULL DEFAULT 'pending',
  server_start_at TIMESTAMPTZ,
  server_end_at   TIMESTAMPTZ,
  sequence        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_room_rounds_room ON public.room_rounds(room_id, sequence DESC);

CREATE TABLE IF NOT EXISTS public.room_answers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          TEXT NOT NULL UNIQUE,
  room_round_id       UUID NOT NULL REFERENCES public.room_rounds(id) ON DELETE CASCADE,
  room_id             UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id),
  answer              TEXT NOT NULL,
  normalized_answer   TEXT,
  outcome             answer_outcome NOT NULL,
  points              INT NOT NULL DEFAULT 0,
  bonus               INT NOT NULL DEFAULT 0,
  response_time_ms    INT,
  server_validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_round_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_answers_round ON public.room_answers(room_round_id);

ALTER TABLE public.room_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_rounds_select ON public.room_rounds FOR SELECT USING (true);
CREATE POLICY room_answers_select ON public.room_answers FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.host_id = auth.uid()
  ));
CREATE POLICY room_answers_insert ON public.room_answers FOR INSERT
  WITH CHECK (auth.uid() = user_id);
