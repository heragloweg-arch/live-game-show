-- Allow delayed AdMob SSV callbacks to arrive without losing legitimate rewards.
BEGIN;

ALTER TABLE public.ad_reward_pending
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');

CREATE OR REPLACE FUNCTION public.prepare_ad_reward_ssv_atomic(
  p_user_id UUID,
  p_request_id UUID,
  p_placement TEXT DEFAULT 'rewarded_extra_coins',
  p_daily_cap INT DEFAULT 12
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_today_start TIMESTAMPTZ := (now() AT TIME ZONE 'Asia/Riyadh')::date AT TIME ZONE 'Asia/Riyadh';
  v_claimed INT;
  v_pending INT;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_placement <> 'rewarded_extra_coins'
     OR p_daily_cap < 1 OR p_daily_cap > 12 THEN
    RAISE EXCEPTION 'Invalid rewarded-ad request';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  UPDATE public.ad_reward_pending
    SET status = 'expired'
    WHERE user_id = p_user_id AND status = 'pending' AND expires_at <= now();

  SELECT count(*) INTO v_claimed
    FROM public.ad_reward_claims
    WHERE user_id = p_user_id AND created_at >= v_today_start;
  SELECT count(*) INTO v_pending
    FROM public.ad_reward_pending
    WHERE user_id = p_user_id AND status = 'pending'
      AND created_at >= v_today_start AND expires_at > now();

  IF v_claimed + v_pending >= p_daily_cap THEN
    RAISE EXCEPTION 'Daily ad reward limit';
  END IF;

  INSERT INTO public.ad_reward_pending(request_id, user_id, placement, status, expires_at)
    VALUES (p_request_id, p_user_id, p_placement, 'pending', now() + interval '24 hours');
  RETURN jsonb_build_object('requestId', p_request_id, 'status', 'pending');
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_ad_reward_ssv_atomic(UUID, UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_ad_reward_ssv_atomic(UUID, UUID, TEXT, INT) TO service_role;

COMMIT;
