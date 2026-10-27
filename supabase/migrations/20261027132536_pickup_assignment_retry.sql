-- P0 follow-up: an already-assigned pickup owner must be able to retrieve their assigned team idempotently.
BEGIN;
CREATE OR REPLACE FUNCTION public.join_team_pickup_atomic(p_user_id UUID,p_desired_size INT DEFAULT 5,p_difficulty TEXT DEFAULT 'normal')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE v_difficulty public.difficulty_level; v_batch UUID[]; v_count INT; v_team_id UUID; v_owner UUID; v_invite TEXT; v_attempt INT:=0;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'USER_ID_REQUIRED'; END IF;
  IF p_desired_size IS NULL OR p_desired_size<1 OR p_desired_size>5 THEN RAISE EXCEPTION 'INVALID_DESIRED_SIZE'; END IF;
  IF COALESCE(p_difficulty,'') NOT IN ('easy','normal','hard') THEN RAISE EXCEPTION 'INVALID_DIFFICULTY'; END IF;
  v_difficulty:=p_difficulty::public.difficulty_level;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha:pickup:'||p_desired_size::text||':'||v_difficulty::text,0));

  IF EXISTS(SELECT 1 FROM public.team_pickup_queue WHERE user_id=p_user_id AND status='assigned' AND team_id IS NOT NULL) THEN
    SELECT team_id INTO v_team_id FROM public.team_pickup_queue WHERE user_id=p_user_id AND status='assigned' AND team_id IS NOT NULL;
    IF EXISTS(SELECT 1 FROM public.teams WHERE id=v_team_id) THEN
      RETURN jsonb_build_object('status','team_ready','teamId',v_team_id,'size',p_desired_size,'alreadyAssigned',true);
    END IF;
    UPDATE public.team_pickup_queue SET status='waiting',team_id=NULL,joined_at=now() WHERE user_id=p_user_id;
  END IF;

  IF EXISTS(SELECT 1 FROM public.teams WHERE owner_id=p_user_id) THEN RAISE EXCEPTION 'TEAM_OWNER_CANNOT_PICKUP'; END IF;

  INSERT INTO public.team_pickup_queue(user_id,desired_size,difficulty,status,team_id,joined_at)
  VALUES(p_user_id,p_desired_size,v_difficulty,'waiting',NULL,now())
  ON CONFLICT(user_id) DO UPDATE SET desired_size=EXCLUDED.desired_size,difficulty=EXCLUDED.difficulty,status='waiting',team_id=NULL,
    joined_at=CASE WHEN public.team_pickup_queue.status='waiting' AND public.team_pickup_queue.desired_size=EXCLUDED.desired_size
      AND public.team_pickup_queue.difficulty=EXCLUDED.difficulty THEN public.team_pickup_queue.joined_at ELSE now() END;

  SELECT array_agg(q.user_id ORDER BY q.joined_at,q.user_id) INTO v_batch
  FROM (
    SELECT p.user_id,p.joined_at FROM public.team_pickup_queue p
    WHERE p.status='waiting' AND p.desired_size=p_desired_size AND p.difficulty=v_difficulty
      AND NOT EXISTS(SELECT 1 FROM public.teams owned WHERE owned.owner_id=p.user_id)
    ORDER BY p.joined_at,p.user_id FOR UPDATE SKIP LOCKED LIMIT p_desired_size
  ) q;
  v_count:=COALESCE(cardinality(v_batch),0);
  IF v_count<p_desired_size THEN RETURN jsonb_build_object('status','waiting','size',p_desired_size,'waiting',v_count,'need',p_desired_size-v_count); END IF;

  v_owner:=v_batch[1];
  LOOP
    v_attempt:=v_attempt+1;
    v_invite:=upper(substr(encode(gen_random_bytes(8),'hex'),1,6));
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.teams WHERE invite_code=v_invite);
    IF v_attempt>=8 THEN RAISE EXCEPTION 'INVITE_CODE_GENERATION_FAILED'; END IF;
  END LOOP;
  INSERT INTO public.teams(name,invite_code,owner_id,max_members)
  VALUES('تجميع '||p_desired_size::text||'v'||p_desired_size::text,v_invite,v_owner,p_desired_size) RETURNING id INTO v_team_id;
  DELETE FROM public.team_members WHERE user_id=ANY(v_batch);
  INSERT INTO public.team_members(team_id,user_id,role)
  SELECT v_team_id,u,CASE WHEN u=v_owner THEN 'owner' ELSE 'member' END FROM unnest(v_batch) AS u;
  UPDATE public.team_pickup_queue SET status='assigned',team_id=v_team_id WHERE user_id=ANY(v_batch) AND status='waiting';
  RETURN jsonb_build_object('status','team_ready','teamId',v_team_id,'size',p_desired_size,'memberIds',to_jsonb(v_batch));
END;
$function$;
REVOKE ALL ON FUNCTION public.join_team_pickup_atomic(UUID,INT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.join_team_pickup_atomic(UUID,INT,TEXT) TO service_role;
COMMIT;