-- P0: invite acceptance and match materialization are a single transaction.
BEGIN;
CREATE OR REPLACE FUNCTION public.accept_match_invite_atomic(p_user_id UUID,p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE v_invite public.match_invites%ROWTYPE; v_match_id UUID; v_difficulty public.difficulty_level;
  v_challenges UUID[]:=ARRAY[]::UUID[]; v_challenge UUID; v_round INT; v_a public.profiles%ROWTYPE; v_b public.profiles%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR COALESCE(trim(p_token),'')='' THEN RAISE EXCEPTION 'INVITE_ARGUMENT_REQUIRED'; END IF;
  SELECT * INTO v_invite FROM public.match_invites WHERE token=p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_NOT_FOUND'; END IF;
  IF v_invite.status<>'pending' THEN RAISE EXCEPTION 'INVITE_UNAVAILABLE'; END IF;
  IF v_invite.expires_at<=now() THEN
    UPDATE public.match_invites SET status='expired' WHERE id=v_invite.id;
    RETURN jsonb_build_object('ok',false,'error','INVITE_EXPIRED');
  END IF;
  IF v_invite.from_user=p_user_id THEN RAISE EXCEPTION 'INVITE_SELF_ACCEPT'; END IF;
  IF EXISTS(SELECT 1 FROM public.user_blocks b WHERE (b.blocker_id=p_user_id AND b.blocked_id=v_invite.from_user) OR (b.blocker_id=v_invite.from_user AND b.blocked_id=p_user_id)) THEN
    RAISE EXCEPTION 'INVITE_BLOCKED';
  END IF;
  SELECT * INTO v_a FROM public.profiles WHERE id=v_invite.from_user FOR SHARE;
  SELECT * INTO v_b FROM public.profiles WHERE id=p_user_id FOR SHARE;
  IF v_a.id IS NULL OR v_b.id IS NULL THEN RAISE EXCEPTION 'INVITE_PROFILE_NOT_FOUND'; END IF;
  v_difficulty:=COALESCE(v_invite.difficulty,'normal'::public.difficulty_level);
  FOR v_round IN 1..5 LOOP
    SELECT c.id INTO v_challenge FROM public.challenges c
    WHERE c.active=true AND c.qa_status='approved' AND c.difficulty=v_difficulty AND NOT(c.id=ANY(v_challenges)
      ) AND (
        EXISTS(SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id=c.id)
        OR EXISTS(SELECT 1 FROM public.challenge_choices cc WHERE cc.challenge_id=c.id GROUP BY cc.challenge_id HAVING count(*)>=2 AND bool_or(cc.is_correct=true))
        OR (c.letter_pool IS NOT NULL AND cardinality(c.letter_pool)>0 AND c.max_length IS NOT NULL AND c.max_length BETWEEN 1 AND cardinality(c.letter_pool))
      )
    ORDER BY random() LIMIT 1;
    IF v_challenge IS NULL THEN RAISE EXCEPTION 'NOT_ENOUGH_PLAYABLE_CHALLENGES'; END IF;
    v_challenges:=array_append(v_challenges,v_challenge);
  END LOOP;
  INSERT INTO public.matches(mode,status,difficulty,current_round,total_rounds,sequence,server_now,started_at)
  VALUES('1v1','VS',v_difficulty,1,5,1,now(),now()) RETURNING id INTO v_match_id;
  INSERT INTO public.match_participants(match_id,user_id,side,username,avatar_url,score,is_ai,state)
  VALUES
    (v_match_id,v_invite.from_user,'player',COALESCE(v_a.display_name,v_a.username,'لاعب'),v_a.avatar_url,0,false,'active'),
    (v_match_id,p_user_id,'opponent',COALESCE(v_b.display_name,v_b.username,'لاعب'),v_b.avatar_url,0,false,'active');
  INSERT INTO public.rounds(match_id,round_number,challenge_id,status,sequence)
  SELECT v_match_id,n,v_challenges[n],'pending',0 FROM generate_series(1,5) n;
  UPDATE public.match_invites SET status='accepted',to_user=p_user_id,match_id=v_match_id WHERE id=v_invite.id AND status='pending';
  RETURN jsonb_build_object('ok',true,'matchId',v_match_id,'inviteId',v_invite.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.accept_match_invite_atomic(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_match_invite_atomic(UUID,TEXT) TO service_role;
COMMIT;