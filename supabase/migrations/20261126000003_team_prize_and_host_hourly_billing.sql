-- Qaddaha production economy contract v4
-- Team league: every member of the champion team receives exactly 3,000 coins.
-- Host rooms: coin access is billed as 2,000 coins per completed hour.
-- Both paths remain server-authoritative, locked, and idempotent.

CREATE OR REPLACE FUNCTION public.distribute_team_tournament_prizes(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_t public.tournaments%ROWTYPE;
  v_members INT;
  v_reward_per_member CONSTANT INT := 3000;
  v_total_paid INT := 0;
  m RECORD;
  v_balance INT;
  paid JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO v_t
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
  IF v_t.competition_mode <> 'team_league' THEN RAISE EXCEPTION 'NOT_TEAM_TOURNAMENT'; END IF;
  IF v_t.prizes_distributed THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'rewardPerMember', v_reward_per_member);
  END IF;
  IF v_t.status <> 'completed' OR v_t.champion_team_id IS NULL THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_COMPLETED';
  END IF;

  SELECT count(*) INTO v_members
  FROM public.tournament_team_members
  WHERE tournament_team_id = v_t.champion_team_id;
  IF v_members < 1 THEN RAISE EXCEPTION 'CHAMPION_TEAM_EMPTY'; END IF;

  -- The tournament row lock plus prizes_distributed flag makes retries safe.
  -- The unique period/reference contract is preserved by one ledger row per member.
  FOR m IN
    SELECT user_id
    FROM public.tournament_team_members
    WHERE tournament_team_id = v_t.champion_team_id
    ORDER BY user_id
  LOOP
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + v_reward_per_member,
        updated_at = now()
    WHERE id = m.user_id
    RETURNING coins INTO v_balance;

    IF NOT FOUND THEN RAISE EXCEPTION 'CHAMPION_MEMBER_PROFILE_NOT_FOUND'; END IF;

    INSERT INTO public.wallet_ledger(user_id, amount, type, reference_id, balance_after)
    VALUES (
      m.user_id,
      v_reward_per_member,
      'tournament_prize',
      p_tournament_id::text || ':team:' || v_t.champion_team_id::text || ':member:' || m.user_id::text,
      v_balance
    );
    v_total_paid := v_total_paid + v_reward_per_member;
    paid := paid || jsonb_build_object(
      'userId', m.user_id,
      'amount', v_reward_per_member,
      'team', true
    );
  END LOOP;

  UPDATE public.tournaments
  SET prizes_distributed = true,
      settled_at = now(),
      updated_at = now()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'ok', true,
    'paid', paid,
    'rewardPerMember', v_reward_per_member,
    'members', v_members,
    'totalPaid', v_total_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_team_tournament_prizes(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_team_tournament_prizes(UUID) TO service_role;

-- Align the seeded league metadata with the actual per-member reward contract.
UPDATE public.tournaments
SET description = 'دوري فرق قدها: كل فريق يواجه كل فريق، 3 نقاط للفوز ونقطة للتعادل، ومكافأة 3000 كوين لكل فرد في الفريق الفائز.',
    prize_pool = 15000,
    entry_coins = 500,
    updated_at = now()
WHERE slug = 'teams-s1' AND competition_mode = 'team_league';

-- Existing paid host sessions move to the new one-hour contract without charging
-- retroactively. The next heartbeat performs one atomic 2,000-coin charge per due hour.
UPDATE public.host_room_sessions
SET interval_seconds = 3600,
    coin_cost = 2000,
    next_charge_at = COALESCE(last_charge_at, created_at) + interval '1 hour'
WHERE access_mode = 'coins' AND status = 'active';

-- Keep the charge ledger idempotent at the database boundary.
CREATE UNIQUE INDEX IF NOT EXISTS uq_host_room_charge_session_period
  ON public.host_room_charges(session_id, period_start);

-- Defensive check: no client role can call billing or prize distribution directly.
REVOKE ALL ON FUNCTION public.bill_host_room_period_atomic(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bill_host_room_period_atomic(UUID, TIMESTAMPTZ) TO service_role;

-- New host-room creation defaults; Edge Function also passes these values explicitly.
CREATE OR REPLACE FUNCTION public.create_host_room_atomic(
  p_host_id UUID,
  p_code TEXT,
  p_title TEXT,
  p_social_provider TEXT DEFAULT NULL,
  p_social_account_id TEXT DEFAULT NULL,
  p_coin_cost INT DEFAULT 2000,
  p_interval_seconds INT DEFAULT 3600
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


REVOKE ALL ON FUNCTION public.create_host_room_atomic(UUID, TEXT, TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_host_room_atomic(UUID, TEXT, TEXT, TEXT, TEXT, INT, INT) TO service_role;
