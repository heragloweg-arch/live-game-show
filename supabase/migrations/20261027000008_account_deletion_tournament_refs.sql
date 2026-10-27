-- P0: preserve historical tournament fixtures when a profile-owned team is cascaded on account deletion.
BEGIN;
CREATE OR REPLACE FUNCTION public.delete_account_data_atomic(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE v_rooms INT:=0; v_answers INT:=0;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_USER_ID'; END IF;

  DELETE FROM public.rooms WHERE host_id=p_user_id;
  GET DIAGNOSTICS v_rooms=ROW_COUNT;
  DELETE FROM public.answer_submissions WHERE user_id=p_user_id;
  GET DIAGNOSTICS v_answers=ROW_COUNT;
  DELETE FROM public.room_answers WHERE user_id=p_user_id;
  DELETE FROM public.room_participants WHERE user_id=p_user_id;
  DELETE FROM public.matchmaking_queue WHERE user_id=p_user_id;
  DELETE FROM public.team_match_queue WHERE owner_id=p_user_id;
  DELETE FROM public.team_pickup_queue WHERE user_id=p_user_id;
  DELETE FROM public.xp_events WHERE user_id=p_user_id;

  -- Null historical match references before owned teams cascade with the profile.
  UPDATE public.matches SET team_a_id=NULL
  WHERE team_a_id IN (SELECT id FROM public.teams WHERE owner_id=p_user_id);
  UPDATE public.matches SET team_b_id=NULL
  WHERE team_b_id IN (SELECT id FROM public.teams WHERE owner_id=p_user_id);

  -- tournament_matches uses NO ACTION FKs to tournament_teams; clear all three
  -- references before deleting a team cascades its tournament_teams row.
  UPDATE public.tournament_matches tm SET team_a_id=NULL
  WHERE tm.team_a_id IN (
    SELECT tt.id FROM public.tournament_teams tt JOIN public.teams t ON t.id=tt.team_id WHERE t.owner_id=p_user_id
  );
  UPDATE public.tournament_matches tm SET team_b_id=NULL
  WHERE tm.team_b_id IN (
    SELECT tt.id FROM public.tournament_teams tt JOIN public.teams t ON t.id=tt.team_id WHERE t.owner_id=p_user_id
  );
  UPDATE public.tournament_matches tm SET winning_team_id=NULL
  WHERE tm.winning_team_id IN (
    SELECT tt.id FROM public.tournament_teams tt JOIN public.teams t ON t.id=tt.team_id WHERE t.owner_id=p_user_id
  );

  UPDATE public.match_participants SET user_id=NULL,username='لاعب محذوف',avatar_url=NULL WHERE user_id=p_user_id;
  UPDATE public.matches SET winner_id=NULL WHERE winner_id=p_user_id;
  UPDATE public.tournaments SET created_by=NULL WHERE created_by=p_user_id;
  UPDATE public.tournament_matches SET player_a=NULL WHERE player_a=p_user_id;
  UPDATE public.tournament_matches SET player_b=NULL WHERE player_b=p_user_id;
  UPDATE public.tournament_matches SET winner_id=NULL WHERE winner_id=p_user_id;
  UPDATE public.challenges SET reviewed_by=NULL WHERE reviewed_by=p_user_id;
  UPDATE public.security_events SET user_id=NULL WHERE user_id=p_user_id;

  DELETE FROM public.profiles WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('ok',true,'rooms_deleted',v_rooms,'answers_deleted',v_answers);
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_account_data_atomic(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data_atomic(UUID) TO service_role;
COMMIT;