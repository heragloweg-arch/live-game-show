-- P0: server-owned app-open/session telemetry; client storage is not a retention source of truth.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS retention_opens_app_session_uidx
ON public.retention_opens(user_id,(metadata->>'session_id'))
WHERE surface='app_open' AND metadata ? 'session_id';

CREATE OR REPLACE FUNCTION public.record_app_open_atomic(p_user_id UUID,p_session_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'USER_ID_REQUIRED'; END IF;
  IF p_session_id IS NULL OR length(p_session_id)<8 OR length(p_session_id)>100 OR p_session_id !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'INVALID_SESSION_ID';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha:app-open:'||p_user_id::text,0));
  IF EXISTS(SELECT 1 FROM public.retention_opens WHERE user_id=p_user_id AND surface='app_open' AND metadata->>'session_id'=p_session_id) THEN
    RETURN jsonb_build_object('ok',true,'recorded',false,'duplicate',true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.retention_opens WHERE user_id=p_user_id AND surface='app_open' AND created_at>now()-interval '90 seconds') THEN
    RETURN jsonb_build_object('ok',true,'recorded',false,'throttled',true);
  END IF;
  INSERT INTO public.retention_opens(user_id,surface,metadata)
  VALUES(p_user_id,'app_open',jsonb_build_object('session_id',p_session_id,'schema_version',1));
  RETURN jsonb_build_object('ok',true,'recorded',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_app_open_atomic(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_app_open_atomic(UUID,TEXT) TO service_role;
COMMIT;