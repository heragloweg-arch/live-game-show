-- Qaddaha Host Access, Coin Packs and TikTok OAuth foundation
-- Server-authoritative: host trial and recurring coin charges never run in the client.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS host_trial_used_at TIMESTAMPTZ;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS social_provider TEXT,
  ADD COLUMN IF NOT EXISTS social_account_id TEXT;

CREATE TABLE IF NOT EXISTS public.host_room_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id            UUID NOT NULL UNIQUE REFERENCES public.rooms(id) ON DELETE CASCADE,
  host_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_mode        TEXT NOT NULL CHECK (access_mode IN ('trial', 'subscription', 'coins')),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'blocked')),
  interval_seconds   INT NOT NULL DEFAULT 1800 CHECK (interval_seconds BETWEEN 300 AND 86400),
  coin_cost          INT NOT NULL DEFAULT 50 CHECK (coin_cost >= 0),
  next_charge_at     TIMESTAMPTZ,
  last_charge_at     TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_host_room_sessions_host
  ON public.host_room_sessions(host_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.host_room_charges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.host_room_sessions(id) ON DELETE CASCADE,
  room_id     UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  host_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  amount      INT NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_host_room_charges_host
  ON public.host_room_charges(host_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.coin_catalog (
  pack_id           TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  coins             INT NOT NULL CHECK (coins > 0),
  price_micros      BIGINT NOT NULL CHECK (price_micros >= 0),
  currency          TEXT NOT NULL DEFAULT 'SAR',
  google_product_id TEXT NOT NULL UNIQUE,
  active            BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO public.coin_catalog (pack_id, title, coins, price_micros, currency, google_product_id)
VALUES
  ('coins_250', 'حزمة البداية', 250, 9990000, 'SAR', 'qaddaha_coins_250'),
  ('coins_700', 'حزمة المنافس', 700, 19990000, 'SAR', 'qaddaha_coins_700'),
  ('coins_1800', 'حزمة البطل', 1800, 39990000, 'SAR', 'qaddaha_coins_1800')
ON CONFLICT (pack_id) DO UPDATE SET
  title = EXCLUDED.title,
  coins = EXCLUDED.coins,
  price_micros = EXCLUDED.price_micros,
  currency = EXCLUDED.currency,
  google_product_id = EXCLUDED.google_product_id;

CREATE TABLE IF NOT EXISTS public.coin_purchase_receipts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_id        TEXT NOT NULL REFERENCES public.coin_catalog(pack_id),
  product_id     TEXT NOT NULL,
  purchase_token TEXT NOT NULL,
  order_id       TEXT,
  provider       TEXT NOT NULL DEFAULT 'google_play',
  status         TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'rejected')),
  coins_awarded  INT NOT NULL CHECK (coins_awarded >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, purchase_token)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coin_purchase_provider_token
  ON public.coin_purchase_receipts(provider, purchase_token);

CREATE TABLE IF NOT EXISTS public.tiktok_connections (
  user_id                    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  open_id                    TEXT NOT NULL UNIQUE,
  display_name               TEXT,
  avatar_url                 TEXT,
  scopes                     TEXT[] NOT NULL DEFAULT '{}',
  access_token               TEXT NOT NULL,
  refresh_token              TEXT,
  access_token_expires_at    TIMESTAMPTZ,
  refresh_token_expires_at   TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tiktok_oauth_states (
  state       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_oauth_states_expiry
  ON public.tiktok_oauth_states(expires_at);

ALTER TABLE public.host_room_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_room_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_oauth_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.host_room_sessions FROM anon, authenticated;
REVOKE ALL ON public.host_room_charges FROM anon, authenticated;
REVOKE ALL ON public.coin_catalog FROM anon, authenticated;
REVOKE ALL ON public.coin_purchase_receipts FROM anon, authenticated;
REVOKE ALL ON public.tiktok_connections FROM anon, authenticated;
REVOKE ALL ON public.tiktok_oauth_states FROM anon, authenticated;
GRANT ALL ON public.host_room_sessions TO service_role;
GRANT ALL ON public.host_room_charges TO service_role;
GRANT ALL ON public.coin_catalog TO service_role;
GRANT ALL ON public.coin_purchase_receipts TO service_role;
GRANT ALL ON public.tiktok_connections TO service_role;
GRANT ALL ON public.tiktok_oauth_states TO service_role;

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
      AND s.plan = 'host_pro'
      AND s.status IN ('active', 'grace')
      AND (s.expires_at IS NULL OR s.expires_at > v_now)
  ) OR (
    v_profile.subscription_plan = 'host_pro'
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
      AND s.plan = 'host_pro'
      AND s.status IN ('active', 'grace')
      AND (s.expires_at IS NULL OR s.expires_at > p_now)
  ) OR (
    v_profile.subscription_plan = 'host_pro'
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

CREATE OR REPLACE FUNCTION public.end_host_room_session(p_room_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.host_room_sessions
  SET status = 'ended', ended_at = COALESCE(ended_at, now())
  WHERE room_id = p_room_id AND status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_coin_purchase_atomic(
  p_user_id UUID,
  p_pack_id TEXT,
  p_product_id TEXT,
  p_purchase_token TEXT,
  p_order_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_pack RECORD;
  v_profile RECORD;
  v_receipt RECORD;
  v_balance INT;
BEGIN
  SELECT * INTO v_pack FROM public.coin_catalog WHERE pack_id = p_pack_id AND google_product_id = p_product_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_COIN_PACK'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT * INTO v_receipt FROM public.coin_purchase_receipts
  WHERE provider = 'google_play' AND purchase_token = p_purchase_token
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.user_id <> p_user_id THEN RAISE EXCEPTION 'PURCHASE_TOKEN_CONFLICT'; END IF;
    RETURN jsonb_build_object('ok', true, 'already', true, 'coins', v_profile.coins, 'awarded', 0, 'pack_id', v_pack.pack_id);
  END IF;

  v_balance := COALESCE(v_profile.coins, 0) + v_pack.coins;
  UPDATE public.profiles SET coins = v_balance, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.coin_purchase_receipts (user_id, pack_id, product_id, purchase_token, order_id, coins_awarded)
  VALUES (p_user_id, p_pack_id, p_product_id, p_purchase_token, p_order_id, v_pack.coins);
  INSERT INTO public.wallet_ledger (user_id, type, currency, amount, balance_after, reference_id, meta)
  VALUES (p_user_id, 'coin_purchase', 'coins', v_pack.coins, v_balance, p_purchase_token,
    jsonb_build_object('pack_id', p_pack_id, 'product_id', p_product_id, 'order_id', p_order_id));
  RETURN jsonb_build_object('ok', true, 'already', false, 'coins', v_balance, 'awarded', v_pack.coins, 'pack_id', v_pack.pack_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_host_room_atomic(UUID, TEXT, TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bill_host_room_period_atomic(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.end_host_room_session(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_coin_purchase_atomic(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_host_room_atomic(UUID, TEXT, TEXT, TEXT, TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bill_host_room_period_atomic(UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.end_host_room_session(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_coin_purchase_atomic(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
