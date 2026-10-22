-- Apply host_max to all server-authoritative host access and daily grants.

CREATE OR REPLACE FUNCTION public.claim_subscription_daily_atomic(
  p_user_id UUID,
  p_plan TEXT,
  p_coins INT DEFAULT 25
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_date DATE := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_balance INT;
  v_grant_id UUID;
BEGIN
  IF p_plan NOT IN ('plus_monthly', 'plus_yearly', 'host_pro', 'host_max') THEN
    RAISE EXCEPTION 'Plan is not eligible';
  END IF;
  INSERT INTO public.subscription_daily_grants(user_id, grant_date, plan, coins_awarded)
    VALUES (p_user_id, v_date, p_plan, p_coins)
    ON CONFLICT (user_id, grant_date) DO NOTHING
    RETURNING id INTO v_grant_id;
  IF v_grant_id IS NULL THEN
    SELECT coins INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN jsonb_build_object('coins', COALESCE(v_balance, 0), 'awarded', 0, 'already', true);
  END IF;
  v_balance := public.credit_coins(p_user_id, p_coins, 'subscription_daily', v_date::text);
  RETURN jsonb_build_object('coins', v_balance, 'awarded', p_coins, 'already', false);
END; $$;

CREATE OR REPLACE FUNCTION public.create_host_room_atomic(
  p_host_id UUID,
  p_code TEXT,
  p_title TEXT,
  p_social_provider TEXT DEFAULT NULL,
  p_social_account_id TEXT DEFAULT NULL,
  p_coin_cost INT DEFAULT 50,
  p_interval_seconds INT DEFAULT 1800
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_profile RECORD;
  v_room_id UUID := gen_random_uuid();
  v_session_id UUID := gen_random_uuid();
  v_mode TEXT;
  v_next_charge TIMESTAMPTZ;
  v_has_host_subscription BOOLEAN := false;
  v_social_account TEXT := NULLIF(trim(COALESCE(p_social_account_id, '')), '');
BEGIN
  IF p_host_id IS NULL OR NULLIF(trim(p_code), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_HOST_ROOM_REQUEST';
  END IF;
  IF p_coin_cost < 1 OR p_interval_seconds NOT BETWEEN 300 AND 86400 THEN
    RAISE EXCEPTION 'INVALID_HOST_BILLING';
  END IF;
  IF p_social_provider IS NOT NULL AND p_social_provider <> 'tiktok' THEN
    RAISE EXCEPTION 'UNSUPPORTED_SOCIAL_PROVIDER';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_host_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.host_room_sessions
    WHERE host_id = p_host_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_HOST_ROOM_EXISTS';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_subscriptions s
    WHERE s.user_id = p_host_id
      AND s.plan IN ('host_pro', 'host_max')
      AND s.status IN ('active', 'grace')
      AND (s.expires_at IS NULL OR s.expires_at > v_now)
  ) OR (
    v_profile.subscription_plan IN ('host_pro', 'host_max')
    AND (v_profile.subscription_expires_at IS NULL OR v_profile.subscription_expires_at > v_now)
  ) INTO v_has_host_subscription;

  IF p_social_provider = 'tiktok' THEN
    IF v_social_account IS NULL THEN RAISE EXCEPTION 'TIKTOK_ACCOUNT_REQUIRED'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tiktok_connections c
      WHERE c.user_id = p_host_id AND c.open_id = v_social_account
    ) THEN
      RAISE EXCEPTION 'TIKTOK_NOT_CONNECTED';
    END IF;
  END IF;

  IF v_has_host_subscription THEN
    v_mode := 'subscription';
    v_next_charge := NULL;
  ELSIF v_profile.host_trial_used_at IS NULL THEN
    v_mode := 'trial';
    v_next_charge := v_now + make_interval(secs => p_interval_seconds);
    UPDATE public.profiles SET host_trial_used_at = v_now, updated_at = v_now WHERE id = p_host_id;
  ELSE
    v_mode := 'coins';
    v_next_charge := v_now + make_interval(secs => p_interval_seconds);
    IF COALESCE(v_profile.coins, 0) < p_coin_cost THEN
      RAISE EXCEPTION 'INSUFFICIENT_COINS';
    END IF;
  END IF;

  INSERT INTO public.rooms (id, code, host_id, title, status, max_participants, social_provider, social_account_id)
  VALUES (v_room_id, upper(trim(p_code)), p_host_id, left(COALESCE(NULLIF(trim(p_title), ''), 'تحدي قدها المباشر'), 120), 'waiting', 20, p_social_provider, v_social_account);

  INSERT INTO public.room_participants (room_id, user_id, is_host)
  VALUES (v_room_id, p_host_id, true);

  IF v_mode = 'coins' THEN
    UPDATE public.profiles
    SET coins = coins - p_coin_cost, updated_at = v_now
    WHERE id = p_host_id;
    INSERT INTO public.wallet_ledger (user_id, type, currency, amount, balance_after, reference_id, meta)
    VALUES (p_host_id, 'host_room_charge', 'coins', -p_coin_cost,
      (SELECT coins FROM public.profiles WHERE id = p_host_id), v_room_id::text,
      jsonb_build_object('interval_seconds', p_interval_seconds, 'access_mode', v_mode));
  END IF;

  INSERT INTO public.host_room_sessions (id, room_id, host_id, access_mode, interval_seconds, coin_cost, next_charge_at)
  VALUES (v_session_id, v_room_id, p_host_id, v_mode, p_interval_seconds, p_coin_cost, v_next_charge);

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'code', upper(trim(p_code)),
    'title', left(COALESCE(NULLIF(trim(p_title), ''), 'تحدي قدها المباشر'), 120),
    'status', 'waiting',
    'host_id', p_host_id,
    'access_mode', v_mode,
    'next_charge_at', v_next_charge,
    'coin_cost', p_coin_cost,
    'interval_seconds', p_interval_seconds,
    'social_provider', p_social_provider,
    'social_account_id', v_social_account,
    'coins', (SELECT coins FROM public.profiles WHERE id = p_host_id)
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'ROOM_CODE_CONFLICT';
END;
$$;

CREATE OR REPLACE FUNCTION public.bill_host_room_period_atomic(
  p_room_id UUID,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_session RECORD;
  v_room RECORD;
  v_profile RECORD;
  v_subscription BOOLEAN := false;
  v_due INT := 0;
  v_i INT;
  v_period TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
  v_charged INT := 0;
  v_balance INT := 0;
BEGIN
  SELECT * INTO v_session FROM public.host_room_sessions WHERE room_id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('active', false, 'reason', 'NO_HOST_SESSION'); END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.status = 'ended' THEN
    UPDATE public.host_room_sessions SET status = 'ended', ended_at = COALESCE(ended_at, p_now) WHERE id = v_session.id;
    RETURN jsonb_build_object('active', false, 'reason', 'ROOM_ENDED');
  END IF;
  IF v_session.status <> 'active' THEN
    RETURN jsonb_build_object('active', false, 'reason', upper(v_session.status));
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_session.host_id FOR UPDATE;
  SELECT EXISTS (
    SELECT 1 FROM public.user_subscriptions s
    WHERE s.user_id = v_session.host_id
      AND s.plan IN ('host_pro', 'host_max')
      AND s.status IN ('active', 'grace')
      AND (s.expires_at IS NULL OR s.expires_at > p_now)
  ) OR (
    v_profile.subscription_plan IN ('host_pro', 'host_max')
    AND (v_profile.subscription_expires_at IS NULL OR v_profile.subscription_expires_at > p_now)
  ) INTO v_subscription;

  IF v_session.access_mode = 'subscription' THEN
    IF NOT v_subscription THEN
      UPDATE public.host_room_sessions SET status = 'blocked', ended_at = p_now WHERE id = v_session.id;
      UPDATE public.rooms SET status = 'ended', ended_at = p_now WHERE id = p_room_id;
      RETURN jsonb_build_object('active', false, 'reason', 'SUBSCRIPTION_EXPIRED');
    END IF;
    RETURN jsonb_build_object('active', true, 'access_mode', 'subscription', 'charged', 0, 'next_charge_at', NULL);
  END IF;

  IF v_session.next_charge_at IS NULL OR p_now < v_session.next_charge_at THEN
    RETURN jsonb_build_object('active', true, 'access_mode', v_session.access_mode, 'charged', 0,
      'next_charge_at', v_session.next_charge_at, 'coins', v_profile.coins);
  END IF;

  IF v_session.access_mode = 'trial' THEN
    UPDATE public.host_room_sessions SET status = 'blocked', ended_at = p_now WHERE id = v_session.id;
    UPDATE public.rooms SET status = 'ended', ended_at = p_now WHERE id = p_room_id;
    RETURN jsonb_build_object('active', false, 'reason', 'TRIAL_EXPIRED', 'next_charge_at', v_session.next_charge_at);
  END IF;

  v_next := v_session.next_charge_at;
  v_due := LEAST(4, floor(extract(epoch FROM (p_now - v_next)) / v_session.interval_seconds)::INT + 1);
  FOR v_i IN 1..v_due LOOP
    IF COALESCE(v_profile.coins, 0) < v_session.coin_cost THEN
      UPDATE public.host_room_sessions SET status = 'blocked', ended_at = p_now WHERE id = v_session.id;
      UPDATE public.rooms SET status = 'ended', ended_at = p_now WHERE id = p_room_id;
      RETURN jsonb_build_object('active', false, 'reason', 'INSUFFICIENT_COINS', 'charged', v_charged, 'coins', v_profile.coins);
    END IF;
    v_period := v_next;
    v_profile.coins := v_profile.coins - v_session.coin_cost;
    INSERT INTO public.host_room_charges (session_id, room_id, host_id, period_start, amount)
    VALUES (v_session.id, p_room_id, v_session.host_id, v_period, v_session.coin_cost);
    INSERT INTO public.wallet_ledger (user_id, type, currency, amount, balance_after, reference_id, meta)
    VALUES (v_session.host_id, 'host_room_charge', 'coins', -v_session.coin_cost, v_profile.coins,
      p_room_id::text || ':' || to_char(v_period, 'YYYYMMDDHH24MISS TZH:TZM'),
      jsonb_build_object('period_start', v_period, 'interval_seconds', v_session.interval_seconds));
    v_charged := v_charged + 1;
    v_next := v_next + make_interval(secs => v_session.interval_seconds);
  END LOOP;

  UPDATE public.profiles SET coins = v_profile.coins, updated_at = p_now WHERE id = v_session.host_id;
  UPDATE public.host_room_sessions
  SET next_charge_at = v_next, last_charge_at = p_now
  WHERE id = v_session.id;

  RETURN jsonb_build_object('active', true, 'access_mode', 'coins', 'charged', v_charged,
    'next_charge_at', v_next, 'coins', v_profile.coins);
END;
$$;
