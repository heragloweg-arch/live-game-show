-- Apply Google Play RTDN state changes atomically and idempotently.
BEGIN;

CREATE OR REPLACE FUNCTION public.reconcile_google_play_subscription_atomic(
  p_purchase_token TEXT,
  p_status TEXT,
  p_expires_at TIMESTAMPTZ,
  p_auto_renew BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_user_id UUID;
  v_sub public.user_subscriptions%ROWTYPE;
  v_other public.user_subscriptions%ROWTYPE;
BEGIN
  IF p_purchase_token IS NULL OR length(btrim(p_purchase_token)) = 0 OR length(p_purchase_token) > 4096
     OR p_status NOT IN ('active', 'grace', 'expired', 'cancelled')
     OR p_expires_at IS NULL
     OR (p_status IN ('active', 'grace') AND p_expires_at <= now()) THEN
    RAISE EXCEPTION 'Invalid Google Play subscription reconciliation';
  END IF;

  SELECT user_id INTO v_user_id
    FROM public.user_subscriptions
    WHERE provider = 'google_play' AND provider_token = p_purchase_token
    ORDER BY created_at DESC
    LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'subscription_not_found');
  END IF;

  -- Match activate_subscription_atomic lock order: user first, then provider token.
  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha-user:' || v_user_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha-purchase:google_play:' || p_purchase_token, 0));

  SELECT * INTO v_sub
    FROM public.user_subscriptions
    WHERE provider = 'google_play' AND provider_token = p_purchase_token AND user_id = v_user_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'subscription_not_found');
  END IF;

  UPDATE public.user_subscriptions
    SET status = p_status::public.subscription_status,
        expires_at = p_expires_at,
        auto_renew = p_auto_renew,
        updated_at = now()
    WHERE id = v_sub.id;

  IF p_status IN ('active', 'grace') AND p_expires_at > now() THEN
    UPDATE public.profiles
      SET subscription_plan = v_sub.plan,
          subscription_expires_at = p_expires_at
      WHERE id = v_user_id;
  ELSE
    SELECT * INTO v_other
      FROM public.user_subscriptions
      WHERE user_id = v_user_id
        AND id <> v_sub.id
        AND status IN ('active', 'grace')
        AND expires_at > now()
      ORDER BY expires_at DESC
      LIMIT 1
      FOR UPDATE;
    IF FOUND THEN
      UPDATE public.profiles
        SET subscription_plan = v_other.plan,
            subscription_expires_at = v_other.expires_at
        WHERE id = v_user_id;
    ELSE
      UPDATE public.profiles
        SET subscription_plan = 'free',
            subscription_expires_at = NULL
        WHERE id = v_user_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id, 'status', p_status, 'expires_at', p_expires_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_google_play_subscription_atomic(TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_google_play_subscription_atomic(TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) TO service_role;

COMMIT;
