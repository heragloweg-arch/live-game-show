-- P0: record explicit match abandonment rather than classifying every unfinished match as abandoned.
BEGIN;
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS termination_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_matches_abandoned_at
  ON public.matches(abandoned_at DESC) WHERE abandoned_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.abandon_match_atomic(
  p_match_id UUID,p_user_id UUID,p_reason TEXT DEFAULT 'navigation'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE v_match public.matches%ROWTYPE; v_reason TEXT;
BEGIN
  IF p_match_id IS NULL OR p_user_id IS NULL THEN RAISE EXCEPTION 'MATCH_ABANDON_ARGUMENT_REQUIRED'; END IF;
  v_reason:=CASE WHEN p_reason IN ('navigation','user_exit','network_failure','client_error','timeout') THEN p_reason ELSE 'user_exit' END;
  SELECT * INTO v_match FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_NOT_FOUND'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.match_participants WHERE match_id=p_match_id AND user_id=p_user_id) THEN RAISE EXCEPTION 'MATCH_PARTICIPANT_REQUIRED'; END IF;
  IF v_match.status IN ('MATCH_FINISHED','FINAL_RESULT','MATCH_TERMINATED') THEN
    RETURN jsonb_build_object('ok',true,'alreadyTerminated',true,'status',v_match.status);
  END IF;
  UPDATE public.matches SET status='MATCH_TERMINATED',ended_at=COALESCE(ended_at,now()),
    abandoned_at=COALESCE(abandoned_at,now()),termination_reason=COALESCE(termination_reason,v_reason)
  WHERE id=p_match_id;
  RETURN jsonb_build_object('ok',true,'alreadyTerminated',false,'status','MATCH_TERMINATED');
END;
$function$;
REVOKE ALL ON FUNCTION public.abandon_match_atomic(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_match_atomic(UUID,UUID,TEXT) TO service_role;
COMMIT;