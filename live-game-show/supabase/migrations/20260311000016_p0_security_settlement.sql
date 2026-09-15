-- ═══════════════════════════════════════════════════════════════
-- P0 FINAL PRODUCTION HARDENING — Security + Atomic Settlement
-- ═══════════════════════════════════════════════════════════════

-- 1) Profiles: revoke client update of sensitive columns via trigger
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Clients may only change presentation fields
  NEW.coins := OLD.coins;
  NEW.xp := OLD.xp;
  NEW.level := OLD.level;
  NEW.xp_to_next := OLD.xp_to_next;
  NEW.wins := OLD.wins;
  NEW.losses := OLD.losses;
  NEW.total_matches := OLD.total_matches;
  NEW.subscription_plan := OLD.subscription_plan;
  NEW.subscription_expires_at := OLD.subscription_expires_at;
  IF TG_TABLE_SCHEMA = 'public' THEN
    -- keep any extra economy columns if present
    BEGIN NEW.gems := OLD.gems; EXCEPTION WHEN undefined_column THEN NULL; END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile ON public.profiles;
CREATE TRIGGER trg_protect_profile
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- Prefer column-level grants when available
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (username, display_name, avatar_url, updated_at) ON public.profiles TO authenticated;

-- 2) credit_coins — service_role only
REVOKE ALL ON FUNCTION public.credit_coins(UUID, INT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_coins(UUID, INT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coins(UUID, INT, TEXT, TEXT) TO service_role;

-- 3) answer_submissions — no client insert
DROP POLICY IF EXISTS answers_insert ON public.answer_submissions;
DROP POLICY IF EXISTS answers_select ON public.answer_submissions;
CREATE POLICY answers_select ON public.answer_submissions
  FOR SELECT USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.answer_submissions FROM anon, authenticated;
GRANT SELECT ON public.answer_submissions TO authenticated;

-- 4) One answer per user per round
CREATE UNIQUE INDEX IF NOT EXISTS uq_answer_round_user
  ON public.answer_submissions (round_id, user_id);

-- 5) Atomic match settlement
CREATE OR REPLACE FUNCTION public.settle_match(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  p RECORD;
  v_winner UUID;
  v_now TIMESTAMPTZ := now();
  v_results JSONB := '[]'::jsonb;
  v_won BOOLEAN;
  v_draw BOOLEAN;
  v_xp INT;
  v_coins INT;
  v_bal INT;
  v_existing UUID;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF m.status IN ('MATCH_FINISHED', 'FINAL_RESULT') AND m.ended_at IS NOT NULL THEN
    -- Already settled path: still return winner
    RETURN jsonb_build_object('ok', true, 'already', true, 'winner_id', m.winner_id);
  END IF;

  -- Determine winner from participant scores
  SELECT user_id INTO v_winner
  FROM public.match_participants
  WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false
  ORDER BY score DESC
  LIMIT 1;

  -- Draw if top two human scores equal
  IF (
    SELECT COUNT(DISTINCT score) = 1
    FROM (
      SELECT score FROM public.match_participants
      WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false
      ORDER BY score DESC
      LIMIT 2
    ) top2
  ) AND (
    SELECT COUNT(*) FROM public.match_participants
    WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false
  ) >= 2 THEN
    v_winner := NULL;
  END IF;

  UPDATE public.matches SET
    status = 'MATCH_FINISHED',
    winner_id = v_winner,
    ended_at = COALESCE(ended_at, v_now),
    server_now = v_now,
    sequence = COALESCE(sequence, 0) + 1
  WHERE id = p_match_id;

  FOR p IN
    SELECT * FROM public.match_participants
    WHERE match_id = p_match_id AND user_id IS NOT NULL AND COALESCE(is_ai, false) = false
  LOOP
    v_draw := (v_winner IS NULL);
    v_won := (v_winner IS NOT NULL AND p.user_id = v_winner);
    v_xp := CASE WHEN v_draw THEN 30 WHEN v_won THEN 50 ELSE 20 END;
    v_coins := CASE WHEN v_draw THEN 25 WHEN v_won THEN 50 ELSE 15 END;

    -- Idempotent xp event
    SELECT id INTO v_existing FROM public.xp_events
    WHERE user_id = p.user_id AND reference_id = p_match_id::text AND type = 'match_finish'
    LIMIT 1;

    IF v_existing IS NULL THEN
      UPDATE public.profiles SET
        xp = COALESCE(xp, 0) + v_xp,
        wins = COALESCE(wins, 0) + CASE WHEN v_won THEN 1 ELSE 0 END,
        losses = COALESCE(losses, 0) + CASE WHEN (NOT v_won AND NOT v_draw) THEN 1 ELSE 0 END,
        total_matches = COALESCE(total_matches, 0) + 1,
        coins = COALESCE(coins, 0) + v_coins,
        updated_at = v_now
      WHERE id = p.user_id
      RETURNING coins INTO v_bal;

      INSERT INTO public.xp_events (user_id, amount, type, reference_id)
      VALUES (p.user_id, v_xp, 'match_finish', p_match_id::text);

      BEGIN
        INSERT INTO public.wallet_ledger (user_id, amount, type, reference_id, balance_after)
        VALUES (p.user_id, v_coins, 'match_reward', p_match_id::text, v_bal);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    v_results := v_results || jsonb_build_object(
      'userId', p.user_id,
      'won', v_won,
      'draw', v_draw,
      'xp', v_xp,
      'coins', v_coins
    );
  END LOOP;

  -- Couple stats from server result
  IF m.mode = 'couple' AND m.couple_id IS NOT NULL THEN
    UPDATE public.couples SET
      shared_matches = COALESCE(shared_matches, 0) + 1,
      shared_wins = COALESCE(shared_wins, 0) + CASE WHEN v_winner IS NOT NULL THEN 1 ELSE 0 END,
      last_played_at = v_now,
      last_match_id = p_match_id,
      updated_at = v_now
    WHERE id = m.couple_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'winner_id', v_winner, 'rewards', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_match(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_match(UUID) TO service_role;

-- 6) Atomic tournament prize distribution
CREATE OR REPLACE FUNCTION public.distribute_tournament_prizes(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  pool INT;
  paid JSONB := '[]'::jsonb;
  amt INT;
  bal INT;
BEGIN
  SELECT * INTO t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF t.prizes_distributed THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF t.status <> 'completed' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_completed'); END IF;

  pool := COALESCE(t.prize_pool, 0);

  -- champion 60%
  IF t.champion_id IS NOT NULL AND pool > 0 THEN
    amt := floor(pool * 0.6);
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + amt WHERE id = t.champion_id RETURNING coins INTO bal;
    INSERT INTO public.wallet_ledger (user_id, amount, type, reference_id, balance_after)
    VALUES (t.champion_id, amt, 'tournament_prize', p_tournament_id::text, bal);
    paid := paid || jsonb_build_object('userId', t.champion_id, 'amount', amt, 'place', 'champion');
  END IF;

  IF t.runner_up_id IS NOT NULL AND pool > 0 THEN
    amt := floor(pool * 0.3);
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + amt WHERE id = t.runner_up_id RETURNING coins INTO bal;
    INSERT INTO public.wallet_ledger (user_id, amount, type, reference_id, balance_after)
    VALUES (t.runner_up_id, amt, 'tournament_prize', p_tournament_id::text, bal);
    paid := paid || jsonb_build_object('userId', t.runner_up_id, 'amount', amt, 'place', 'runner_up');
  END IF;

  UPDATE public.tournaments SET
    prizes_distributed = true,
    settled_at = now(),
    updated_at = now()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object('ok', true, 'paid', paid, 'prizePool', pool);
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_tournament_prizes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribute_tournament_prizes(UUID) TO service_role;

-- 7) Metrics / investor tables — no client write policies for authenticated insert
DROP POLICY IF EXISTS analytics_daily_select ON public.analytics_daily;
DROP POLICY IF EXISTS investor_snapshots_select ON public.investor_snapshots;
-- Only service_role via Edge; revoke direct
REVOKE ALL ON public.analytics_daily FROM anon, authenticated;
REVOKE ALL ON public.investor_snapshots FROM anon, authenticated;
GRANT SELECT ON public.analytics_daily TO service_role;
GRANT ALL ON public.analytics_daily TO service_role;
GRANT ALL ON public.investor_snapshots TO service_role;
