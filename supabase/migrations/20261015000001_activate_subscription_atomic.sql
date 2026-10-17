-- Atomically bind one verified provider token, replace prior entitlement rows,
-- and update the profile within the same database transaction.
CREATE OR REPLACE FUNCTION public.activate_subscription_atomic(
  p_user_id UUID,
  p_plan public.subscription_plan,
  p_product_id TEXT,
  p_purchase_token TEXT,
  p_provider TEXT,
  p_expires_at TIMESTAMPTZ,
  p_auto_renew BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_existing public.user_subscriptions%ROWTYPE;
  v_subscription public.user_subscriptions%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_user_id IS NULL OR p_plan IS NULL OR p_product_id IS NULL
     OR length(p_product_id) = 0 OR p_purchase_token IS NULL
     OR length(p_purchase_token) = 0
     OR p_provider IS NULL OR p_provider NOT IN ('google_play', 'dev') THEN
    RAISE EXCEPTION 'Invalid subscription activation';
  END IF;
  IF p_provider = 'google_play' AND (p_expires_at IS NULL OR p_expires_at <= v_now) THEN
    RAISE EXCEPTION 'Verified Google Play subscription must not be expired';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha-user:' || p_user_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('qaddaha-purchase:' || p_provider || ':' || p_purchase_token, 0));

  SELECT * INTO v_existing
    FROM public.user_subscriptions
    WHERE provider = p_provider AND provider_token = p_purchase_token
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

  IF v_existing.id IS NOT NULL AND v_existing.user_id <> p_user_id THEN
    RAISE EXCEPTION 'Purchase token is already linked to another account';
  END IF;

  UPDATE public.user_subscriptions
    SET status = 'cancelled', updated_at = v_now
    WHERE user_id = p_user_id
      AND status IN ('active', 'grace')
      AND (v_existing.id IS NULL OR id <> v_existing.id);

  IF v_existing.id IS NULL THEN
    INSERT INTO public.user_subscriptions (
      user_id, plan, status, provider, provider_token, product_id,
      starts_at, expires_at, auto_renew, updated_at
    ) VALUES (
      p_user_id, p_plan, 'active', p_provider, p_purchase_token, p_product_id,
      v_now, p_expires_at, p_auto_renew, v_now
    ) RETURNING * INTO v_subscription;
  ELSE
    UPDATE public.user_subscriptions
      SET plan = p_plan,
          status = 'active',
          product_id = p_product_id,
          starts_at = COALESCE(v_existing.starts_at, v_now),
          expires_at = p_expires_at,
          auto_renew = p_auto_renew,
          updated_at = v_now
      WHERE id = v_existing.id
      RETURNING * INTO v_subscription;
  END IF;

  UPDATE public.profiles
    SET subscription_plan = p_plan,
        subscription_expires_at = p_expires_at
    WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription profile does not exist';
  END IF;

  RETURN jsonb_build_object(
    'id', v_subscription.id,
    'plan', v_subscription.plan,
    'status', v_subscription.status,
    'expires_at', v_subscription.expires_at,
    'provider', v_subscription.provider,
    'product_id', v_subscription.product_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_subscription_atomic(UUID, public.subscription_plan, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription_atomic(UUID, public.subscription_plan, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN)
  TO service_role;
