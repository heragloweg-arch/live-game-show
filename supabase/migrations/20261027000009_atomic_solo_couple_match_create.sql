-- P0: Solo and Couple match creation is one transaction; no visible VS row without all rounds/participants.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_solo_match_atomic(
  p_user_id UUID,p_journey_branch INT DEFAULT NULL,p_journey_leaf INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE; v_match_id UUID; v_challenges UUID[]:=ARRAY[]::UUID[];
  v_plan TEXT[]:=ARRAY[]::TEXT[]; v_round INT; v_stage INT; v_base INT; v_tier INT; v_diff TEXT; v_challenge UUID;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'USER_ID_REQUIRED'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=p_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF (p_journey_branch IS NULL) <> (p_journey_leaf IS NULL) THEN RAISE EXCEPTION 'INVALID_JOURNEY_STAGE'; END IF;
  IF p_journey_branch IS NOT NULL AND (p_journey_branch NOT BETWEEN 1 AND 6 OR p_journey_leaf NOT BETWEEN 1 AND 8) THEN RAISE EXCEPTION 'INVALID_JOURNEY_STAGE'; END IF;

  IF p_journey_branch IS NOT NULL THEN
    v_stage:=((p_journey_branch-1)*8)+p_journey_leaf;
    v_base:=CASE WHEN v_stage<=16 THEN 1 WHEN v_stage<=40 THEN 2 ELSE 3 END;
    IF v_stage>1 THEN
      IF NOT EXISTS(
        SELECT 1 FROM public.solo_journey_progress
        WHERE user_id=p_user_id AND branch_number=CASE WHEN p_journey_leaf=1 THEN p_journey_branch-1 ELSE p_journey_branch END
          AND leaf_number=CASE WHEN p_journey_leaf=1 THEN 8 ELSE p_journey_leaf-1 END
      ) THEN RAISE EXCEPTION 'JOURNEY_STAGE_LOCKED'; END IF;
    END IF;
  END IF;

  FOR v_round IN 1..5 LOOP
    IF p_journey_branch IS NOT NULL THEN
      v_tier:=LEAST(3,v_base+((v_round-1)/2));
      v_diff:=CASE v_tier WHEN 1 THEN 'easy' WHEN 2 THEN 'normal' ELSE 'hard' END;
    ELSE v_diff:=NULL;
    END IF;
    SELECT c.id INTO v_challenge FROM public.challenges c
    WHERE c.active=true AND c.qa_status='approved'
      AND (v_diff IS NULL OR c.difficulty::text=v_diff)
      AND NOT (c.id=ANY(v_challenges))
      AND (
        EXISTS(SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id=c.id)
        OR EXISTS(SELECT 1 FROM public.challenge_choices cc WHERE cc.challenge_id=c.id GROUP BY cc.challenge_id HAVING count(*)>=2 AND bool_or(cc.is_correct=true))
        OR (c.letter_pool IS NOT NULL AND cardinality(c.letter_pool)>0 AND c.max_length IS NOT NULL AND c.max_length BETWEEN 1 AND cardinality(c.letter_pool))
      )
    ORDER BY random() LIMIT 1;
    IF v_challenge IS NULL THEN RAISE EXCEPTION 'NOT_ENOUGH_PLAYABLE_CHALLENGES'; END IF;
    v_challenges:=array_append(v_challenges,v_challenge);
    v_plan:=array_append(v_plan,COALESCE(v_diff,(SELECT difficulty::text FROM public.challenges WHERE id=v_challenge)));
  END LOOP;

  INSERT INTO public.matches(mode,status,difficulty,current_round,total_rounds,sequence,server_now,config_snapshot)
  VALUES('solo','VS','normal',1,5,1,now(),
    CASE WHEN p_journey_branch IS NOT NULL THEN jsonb_build_object('journeyBranch',p_journey_branch,'journeyLeaf',p_journey_leaf,'difficultyPlan',to_jsonb(v_plan)) ELSE NULL END)
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants(match_id,user_id,side,score,is_ai,username,avatar_url,state)
  VALUES
    (v_match_id,p_user_id,'player',0,false,COALESCE(v_profile.username,'player'),v_profile.avatar_url,'active'),
    (v_match_id,NULL,'ai',0,true,'خصم قدها',NULL,'active');
  UPDATE public.match_participants SET ai_difficulty='normal' WHERE match_id=v_match_id AND is_ai=true;
  INSERT INTO public.rounds(match_id,round_number,challenge_id,status,sequence)
  SELECT v_match_id,n,v_challenges[n],'pending',0 FROM generate_series(1,5) n;
  RETURN jsonb_build_object('matchId',v_match_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_couple_match_atomic(p_user_id UUID,p_difficulty TEXT DEFAULT 'normal')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE
  v_couple public.couples%ROWTYPE; v_partner UUID; v_me public.profiles%ROWTYPE; v_other public.profiles%ROWTYPE;
  v_difficulty public.difficulty_level; v_challenges UUID[]:=ARRAY[]::UUID[]; v_challenge UUID; v_round INT; v_match_id UUID;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'USER_ID_REQUIRED'; END IF;
  IF COALESCE(p_difficulty,'') NOT IN ('easy','normal','hard') THEN RAISE EXCEPTION 'INVALID_DIFFICULTY'; END IF;
  v_difficulty:=p_difficulty::public.difficulty_level;
  SELECT * INTO v_couple FROM public.couples
  WHERE status='active' AND (user_a=p_user_id OR user_b=p_user_id) AND user_b IS NOT NULL
  ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_COUPLE_NOT_FOUND'; END IF;
  v_partner:=CASE WHEN v_couple.user_a=p_user_id THEN v_couple.user_b ELSE v_couple.user_a END;
  IF EXISTS(SELECT 1 FROM public.user_blocks b WHERE (b.blocker_id=p_user_id AND b.blocked_id=v_partner) OR (b.blocker_id=v_partner AND b.blocked_id=p_user_id)) THEN
    RAISE EXCEPTION 'COUPLE_BLOCKED';
  END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id=p_user_id FOR SHARE;
  SELECT * INTO v_other FROM public.profiles WHERE id=v_partner FOR SHARE;
  IF v_me.id IS NULL OR v_other.id IS NULL THEN RAISE EXCEPTION 'COUPLE_PROFILE_NOT_FOUND'; END IF;

  FOR v_round IN 1..5 LOOP
    SELECT c.id INTO v_challenge FROM public.challenges c
    WHERE c.active=true AND c.qa_status='approved' AND c.difficulty=v_difficulty
      AND NOT(c.id=ANY(v_challenges))
      AND (
        EXISTS(SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id=c.id)
        OR EXISTS(SELECT 1 FROM public.challenge_choices cc WHERE cc.challenge_id=c.id GROUP BY cc.challenge_id HAVING count(*)>=2 AND bool_or(cc.is_correct=true))
        OR (c.letter_pool IS NOT NULL AND cardinality(c.letter_pool)>0 AND c.max_length IS NOT NULL AND c.max_length BETWEEN 1 AND cardinality(c.letter_pool))
      )
    ORDER BY random() LIMIT 1;
    IF v_challenge IS NULL THEN RAISE EXCEPTION 'NOT_ENOUGH_PLAYABLE_CHALLENGES'; END IF;
    v_challenges:=array_append(v_challenges,v_challenge);
  END LOOP;

  INSERT INTO public.matches(mode,status,difficulty,current_round,total_rounds,sequence,server_now,couple_id)
  VALUES('couple','VS',v_difficulty,1,5,1,now(),v_couple.id) RETURNING id INTO v_match_id;
  INSERT INTO public.match_participants(match_id,user_id,side,username,avatar_url,score,is_ai,state)
  VALUES
    (v_match_id,p_user_id,'player',COALESCE(v_me.display_name,v_me.username,'أنت'),v_me.avatar_url,0,false,'active'),
    (v_match_id,v_partner,'player',COALESCE(v_other.display_name,v_other.username,'الشريك'),v_other.avatar_url,0,false,'active'),
    (v_match_id,NULL,'ai','الخصم الذكي',NULL,0,true,'active');
  UPDATE public.match_participants SET ai_difficulty=v_difficulty WHERE match_id=v_match_id AND is_ai=true;
  INSERT INTO public.rounds(match_id,round_number,challenge_id,status,sequence)
  SELECT v_match_id,n,v_challenges[n],'pending',0 FROM generate_series(1,5) n;
  UPDATE public.couples SET last_match_id=v_match_id,updated_at=now() WHERE id=v_couple.id;
  RETURN jsonb_build_object('matchId',v_match_id,'coupleId',v_couple.id,'partnerId',v_partner);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_solo_match_atomic(UUID,INT,INT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_solo_match_atomic(UUID,INT,INT) TO service_role;
REVOKE ALL ON FUNCTION public.create_couple_match_atomic(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_couple_match_atomic(UUID,TEXT) TO service_role;
COMMIT;