-- Qaddaha retention, session 2, rematch and latency observability.
-- All values are server-derived; no client aggregate is accepted as truth.
BEGIN;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS rematch_of UUID REFERENCES public.matches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matches_rematch_of ON public.matches(rematch_of)
  WHERE rematch_of IS NOT NULL;

ALTER TABLE public.analytics_daily
  ADD COLUMN IF NOT EXISTS new_users INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS d1_users INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS d7_users INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS d14_users INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS d1_rate NUMERIC(8,5),
  ADD COLUMN IF NOT EXISTS d7_rate NUMERIC(8,5),
  ADD COLUMN IF NOT EXISTS d14_rate NUMERIC(8,5),
  ADD COLUMN IF NOT EXISTS session2_users INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session2_rate NUMERIC(8,5),
  ADD COLUMN IF NOT EXISTS rematch_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rematch_completed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rematch_rate NUMERIC(8,5),
  ADD COLUMN IF NOT EXISTS p95_response_ms INT;

-- The RPC is also used by trusted server paths. Keep the same release contract
-- as the Edge Function so a legacy caller cannot surface withdrawn content.
CREATE OR REPLACE FUNCTION public.open_daily_pack(p_user_id UUID, p_pack_date DATE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pack JSONB;
  v_slots JSONB;
BEGIN
  INSERT INTO public.retention_opens(user_id, surface, metadata)
  VALUES (p_user_id, 'daily_pack', jsonb_build_object('pack_date', p_pack_date));

  SELECT to_jsonb(p) INTO v_pack
  FROM public.daily_packs p
  WHERE p.pack_date = p_pack_date AND p.active;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.slot_number), '[]'::jsonb) INTO v_slots
  FROM (
    SELECT s.id, s.pack_id, s.slot_number, s.challenge_id, s.bonus_coins, s.bonus_xp,
      jsonb_build_object('id', c.id, 'type', c.type, 'subtype', c.subtype, 'prompt', c.prompt,
        'difficulty', c.difficulty, 'timeLimitMs', c.time_limit_ms, 'letterPool', c.letter_pool) AS challenge
    FROM public.daily_pack_slots s
    JOIN public.challenges c ON c.id = s.challenge_id
    WHERE s.pack_id = (v_pack->>'id')::uuid
      AND c.active = true
      AND c.qa_status = 'approved'
      AND (
        c.type <> 'speed' OR c.subtype <> 'letters'
        OR (c.letter_pool IS NOT NULL AND cardinality(c.letter_pool) > 0
            AND EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id = c.id))
      )
  ) x;

  RETURN jsonb_build_object('pack', v_pack, 'slots', v_slots);
END; $$;

REVOKE ALL ON FUNCTION public.open_daily_pack(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_daily_pack(UUID, DATE) TO service_role;

COMMIT;
