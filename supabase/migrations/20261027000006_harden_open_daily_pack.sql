-- P0: the Daily pack read RPC itself returns only active, approved, playable slots.
BEGIN;
CREATE OR REPLACE FUNCTION public.open_daily_pack(p_user_id UUID,p_pack_date DATE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_pack JSONB;
  v_slots JSONB;
  v_slot_count INT;
BEGIN
  IF p_user_id IS NULL OR p_pack_date IS NULL THEN RAISE EXCEPTION 'INVALID_DAILY_PACK_ARGUMENT'; END IF;
  INSERT INTO public.retention_opens(user_id,surface,metadata)
  VALUES(p_user_id,'daily_pack',jsonb_build_object('pack_date',p_pack_date));

  SELECT to_jsonb(p) INTO v_pack
  FROM public.daily_packs p WHERE p.pack_date=p_pack_date AND p.active=true;
  IF v_pack IS NULL THEN RETURN jsonb_build_object('pack',NULL,'slots','[]'::jsonb,'error','DAILY_PACK_NOT_FOUND'); END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.slot_number),'[]'::jsonb)
  INTO v_slots
  FROM (
    SELECT s.id,s.pack_id,s.slot_number,s.challenge_id,s.bonus_coins,s.bonus_xp,
      jsonb_build_object('id',c.id,'type',c.type,'subtype',c.subtype,'prompt',c.prompt,
        'difficulty',c.difficulty,'timeLimitMs',c.time_limit_ms,'letterPool',c.letter_pool) AS challenge
    FROM public.daily_pack_slots s
    JOIN public.challenges c ON c.id=s.challenge_id
    WHERE s.pack_id=(v_pack->>'id')::uuid
      AND c.active=true AND c.qa_status='approved'
      AND (
        EXISTS(SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id=c.id)
        OR EXISTS(SELECT 1 FROM public.challenge_choices cc WHERE cc.challenge_id=c.id
          GROUP BY cc.challenge_id HAVING count(*)>=2 AND bool_or(cc.is_correct=true))
        OR (c.letter_pool IS NOT NULL AND cardinality(c.letter_pool)>0
          AND c.max_length IS NOT NULL AND c.max_length BETWEEN 1 AND cardinality(c.letter_pool))
      )
  ) x;

  v_slot_count := jsonb_array_length(v_slots);
  IF v_slot_count < 3 THEN
    RETURN jsonb_build_object('pack',NULL,'slots','[]'::jsonb,'error','DAILY_PACK_NOT_PLAYABLE','playableSlots',v_slot_count);
  END IF;
  RETURN jsonb_build_object('pack',v_pack,'slots',v_slots);
END;
$function$;
REVOKE ALL ON FUNCTION public.open_daily_pack(UUID,DATE) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_daily_pack(UUID,DATE) TO service_role;
COMMIT;