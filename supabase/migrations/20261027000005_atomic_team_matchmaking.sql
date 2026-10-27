-- P0: atomically claim a team opponent and create all match rows in one transaction.
BEGIN;
CREATE OR REPLACE FUNCTION public.queue_team_match_atomic(
  p_user_id UUID, p_team_id UUID, p_difficulty TEXT DEFAULT 'normal'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_team public.teams%ROWTYPE;
  v_opponent_queue public.team_match_queue%ROWTYPE;
  v_opponent public.teams%ROWTYPE;
  v_size INT;
  v_opponent_size INT;
  v_challenges UUID[];
  v_match_id UUID;
  v_existing_match UUID;
  v_difficulty public.difficulty_level;
BEGIN
  IF p_user_id IS NULL OR p_team_id IS NULL THEN RAISE EXCEPTION 'TEAM_QUEUE_ARGUMENT_REQUIRED'; END IF;
  IF COALESCE(p_difficulty,'') NOT IN ('easy','normal','hard') THEN RAISE EXCEPTION 'INVALID_DIFFICULTY'; END IF;
  v_difficulty := p_difficulty::public.difficulty_level;

  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha:team-matchmaking',0));

  SELECT * INTO v_team FROM public.teams WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_NOT_FOUND'; END IF;
  IF v_team.owner_id <> p_user_id OR NOT EXISTS (
    SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND user_id=p_user_id AND role='owner'
  ) THEN RAISE EXCEPTION 'TEAM_OWNER_REQUIRED'; END IF;

  SELECT count(*)::INT INTO v_size FROM public.team_members WHERE team_id=p_team_id;
  IF v_size < 1 OR v_size > 5 THEN RAISE EXCEPTION 'INVALID_TEAM_SIZE'; END IF;

  SELECT q.match_id INTO v_existing_match FROM public.team_match_queue q
  WHERE q.team_id=p_team_id AND q.status='matched' AND q.match_id IS NOT NULL;
  IF v_existing_match IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.matches m WHERE m.id=v_existing_match AND m.status IN ('VS','ROUND_STARTING','ROUND_ACTIVE')
  ) THEN RETURN jsonb_build_object('status','matched','matchId',v_existing_match,'alreadyMatched',true); END IF;

  INSERT INTO public.team_match_queue(team_id,owner_id,team_size,difficulty,status,match_id,joined_at)
  VALUES(p_team_id,p_user_id,v_size,v_difficulty,'queued',NULL,now())
  ON CONFLICT(team_id) DO UPDATE SET owner_id=EXCLUDED.owner_id,team_size=EXCLUDED.team_size,
    difficulty=EXCLUDED.difficulty,status='queued',match_id=NULL,
    joined_at=CASE WHEN public.team_match_queue.status='queued' THEN public.team_match_queue.joined_at ELSE now() END;

  SELECT q.* INTO v_opponent_queue
  FROM public.team_match_queue q
  WHERE q.team_id<>p_team_id AND q.status='queued' AND q.team_size=v_size AND q.difficulty=v_difficulty
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_members a
      JOIN public.team_members b ON true
      JOIN public.user_blocks ub ON
        (ub.blocker_id=a.user_id AND ub.blocked_id=b.user_id)
        OR (ub.blocker_id=b.user_id AND ub.blocked_id=a.user_id)
      WHERE a.team_id=p_team_id AND b.team_id=q.team_id
    )
  ORDER BY q.joined_at ASC
  FOR UPDATE OF q SKIP LOCKED
  LIMIT 1;

  IF v_opponent_queue.team_id IS NULL THEN RETURN jsonb_build_object('status','queued','teamSize',v_size); END IF;

  SELECT * INTO v_opponent FROM public.teams WHERE id=v_opponent_queue.team_id FOR UPDATE;
  SELECT count(*)::INT INTO v_opponent_size FROM public.team_members WHERE team_id=v_opponent_queue.team_id;
  IF v_opponent_size<>v_size OR v_opponent_size<1 OR v_opponent_size>5 THEN
    UPDATE public.team_match_queue SET status='cancelled',match_id=NULL WHERE team_id=v_opponent_queue.team_id;
    RETURN jsonb_build_object('status','queued','reason','OPPONENT_TEAM_SIZE_CHANGED');
  END IF;

  SELECT array_agg(candidate.id ORDER BY candidate.pick_order) INTO v_challenges
  FROM (
    SELECT c.id,row_number() OVER (ORDER BY random()) AS pick_order
    FROM public.challenges c
    WHERE c.active=true AND c.qa_status='approved' AND c.difficulty=v_difficulty
      AND (
        EXISTS (SELECT 1 FROM public.challenge_answers a WHERE a.challenge_id=c.id)
        OR EXISTS (SELECT 1 FROM public.challenge_choices cc WHERE cc.challenge_id=c.id
          GROUP BY cc.challenge_id HAVING count(*)>=2 AND bool_or(cc.is_correct=true))
        OR (c.letter_pool IS NOT NULL AND cardinality(c.letter_pool)>0
          AND c.max_length IS NOT NULL AND c.max_length BETWEEN 1 AND cardinality(c.letter_pool))
      )
    LIMIT 5
  ) candidate;
  IF COALESCE(cardinality(v_challenges),0)<>5 THEN
    RETURN jsonb_build_object('status','queued','reason','NOT_ENOUGH_PLAYABLE_CHALLENGES');
  END IF;

  INSERT INTO public.matches(mode,status,difficulty,current_round,total_rounds,sequence,server_now,started_at,team_size,team_a_id,team_b_id)
  VALUES('team','VS',v_difficulty,1,5,1,now(),now(),v_size,p_team_id,v_opponent_queue.team_id)
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants(match_id,user_id,side,score,username,avatar_url,is_ai,state)
  SELECT v_match_id,tm.user_id,'team_a',0,COALESCE(p.display_name,p.username,'A'),p.avatar_url,false,'active'
  FROM public.team_members tm JOIN public.profiles p ON p.id=tm.user_id WHERE tm.team_id=p_team_id;

  INSERT INTO public.match_participants(match_id,user_id,side,score,username,avatar_url,is_ai,state)
  SELECT v_match_id,tm.user_id,'team_b',0,COALESCE(p.display_name,p.username,'B'),p.avatar_url,false,'active'
  FROM public.team_members tm JOIN public.profiles p ON p.id=tm.user_id WHERE tm.team_id=v_opponent_queue.team_id;

  INSERT INTO public.rounds(match_id,round_number,challenge_id,status,sequence)
  SELECT v_match_id,slot,v_challenges[slot],'pending',0 FROM generate_series(1,5) AS slot;

  UPDATE public.team_match_queue SET status='matched',match_id=v_match_id WHERE team_id IN (p_team_id,v_opponent_queue.team_id);
  RETURN jsonb_build_object('status','matched','matchId',v_match_id,'opponentTeamId',v_opponent_queue.team_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.queue_team_match_atomic(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_team_match_atomic(UUID,UUID,TEXT) TO service_role;
COMMIT;