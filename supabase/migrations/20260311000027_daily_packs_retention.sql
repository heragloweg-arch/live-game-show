-- Daily Pack v2: three-slot daily journey + opens/retention telemetry
CREATE TABLE IF NOT EXISTS public.daily_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_date DATE NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT 'رحلة اليوم',
  theme TEXT NOT NULL DEFAULT 'mixed',
  bonus_coins INT NOT NULL DEFAULT 80,
  bonus_xp INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_pack_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.daily_packs(id) ON DELETE CASCADE,
  slot_number INT NOT NULL CHECK (slot_number BETWEEN 1 AND 3),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id),
  bonus_coins INT NOT NULL DEFAULT 20,
  bonus_xp INT NOT NULL DEFAULT 25,
  UNIQUE(pack_id, slot_number),
  UNIQUE(pack_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS public.daily_pack_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES public.daily_packs(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES public.daily_pack_slots(id) ON DELETE CASCADE,
  outcome public.answer_outcome NOT NULL,
  points INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, slot_id)
);

CREATE TABLE IF NOT EXISTS public.retention_opens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  surface TEXT NOT NULL,
  open_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Riyadh')::date,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_pack_slots_pack ON public.daily_pack_slots(pack_id, slot_number);
CREATE INDEX IF NOT EXISTS idx_retention_opens_user_date ON public.retention_opens(user_id, open_date DESC);
ALTER TABLE public.daily_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_pack_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_pack_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_opens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_packs_select ON public.daily_packs;
CREATE POLICY daily_packs_select ON public.daily_packs FOR SELECT USING (active = true);
DROP POLICY IF EXISTS daily_pack_slots_select ON public.daily_pack_slots;
CREATE POLICY daily_pack_slots_select ON public.daily_pack_slots FOR SELECT USING (true);
DROP POLICY IF EXISTS daily_pack_completions_select ON public.daily_pack_completions;
CREATE POLICY daily_pack_completions_select ON public.daily_pack_completions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS retention_opens_select ON public.retention_opens;
CREATE POLICY retention_opens_select ON public.retention_opens FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS retention_opens_insert ON public.retention_opens;
CREATE POLICY retention_opens_insert ON public.retention_opens FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.open_daily_pack(p_user_id UUID, p_pack_date DATE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pack JSONB; v_slots JSONB;
BEGIN
  INSERT INTO public.retention_opens(user_id, surface, metadata)
  VALUES (p_user_id, 'daily_pack', jsonb_build_object('pack_date', p_pack_date));
  SELECT to_jsonb(p) INTO v_pack FROM public.daily_packs p WHERE p.pack_date = p_pack_date AND p.active;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.slot_number), '[]'::jsonb) INTO v_slots
  FROM (SELECT s.id, s.pack_id, s.slot_number, s.challenge_id, s.bonus_coins, s.bonus_xp,
    jsonb_build_object('id', c.id, 'type', c.type, 'subtype', c.subtype, 'prompt', c.prompt,
      'difficulty', c.difficulty, 'timeLimitMs', c.time_limit_ms, 'letterPool', c.letter_pool) AS challenge
    FROM public.daily_pack_slots s JOIN public.challenges c ON c.id = s.challenge_id
    WHERE s.pack_id = (v_pack->>'id')::uuid) x;
  RETURN jsonb_build_object('pack', v_pack, 'slots', v_slots);
END; $$;
REVOKE ALL ON FUNCTION public.open_daily_pack(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_daily_pack(UUID, DATE) TO service_role;
