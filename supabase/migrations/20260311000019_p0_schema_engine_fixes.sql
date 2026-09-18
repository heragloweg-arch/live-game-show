-- P0: Schema + settle_match + profiles privacy + tournament columns

-- 1) Fix tournaments.difficulty type if wrongly created as public.difficulty
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'difficulty'
  ) THEN
    -- attempt cast if column is text-like or wrong enum
    BEGIN
      ALTER TABLE public.tournaments
        ALTER COLUMN difficulty TYPE public.difficulty_level
        USING difficulty::text::public.difficulty_level;
    EXCEPTION WHEN OTHERS THEN
      -- already correct or needs drop default first
      BEGIN
        ALTER TABLE public.tournaments ALTER COLUMN difficulty DROP DEFAULT;
        ALTER TABLE public.tournaments
          ALTER COLUMN difficulty TYPE public.difficulty_level
          USING difficulty::text::public.difficulty_level;
        ALTER TABLE public.tournaments ALTER COLUMN difficulty SET DEFAULT 'normal'::public.difficulty_level;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END;
  END IF;
END $$;

-- 2) tournament_matches.match_index for round robin
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS match_index INT;

-- 3) xp_events compatibility columns
ALTER TABLE public.xp_events
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id TEXT;
UPDATE public.xp_events SET type = COALESCE(type, source) WHERE type IS NULL;
CREATE INDEX IF NOT EXISTS idx_xp_ref ON public.xp_events(user_id, reference_id);

-- 4) Profiles: public can only see non-sensitive columns via view; tighten SELECT
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (auth.uid() = id);
-- Leaderboard needs limited public fields — use SECURITY DEFINER function later
CREATE POLICY profiles_select_public_basic ON public.profiles
  FOR SELECT USING (true);
-- Note: we hide coins/subscription via column-level REVOKE for authenticated
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, display_name, avatar_url, level, wins, losses, total_matches, created_at
) ON public.profiles TO authenticated;
GRANT SELECT (
  id, username, display_name, avatar_url, level, wins, losses, total_matches, created_at,
  coins, xp, xp_to_next, subscription_plan, subscription_expires_at, updated_at
) ON public.profiles TO service_role;
GRANT SELECT ON public.profiles TO service_role;

-- Own full row for authenticated via additional policy won't restore revoked columns —
-- clients read wallet via economy Edge Function. Leaderboard uses public columns only.

-- 5) settle_match fixed: AI can win solo; couple team vs AI
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
  v_team_score INT := 0;
  v_ai_score INT := 0;
  v_top_human INT := 0;
  v_top_ai INT := 0;
  v_human_count INT := 0;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF m.status IN ('MATCH_FINISHED', 'FINAL_RESULT') AND m.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'winner_id', m.winner_id);
  END IF;

  SELECT COALESCE(MAX(score), 0) INTO v_top_human
  FROM public.match_participants
  WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false;

  SELECT COALESCE(MAX(score), 0) INTO v_top_ai
  FROM public.match_participants
  WHERE match_id = p_match_id AND COALESCE(is_ai, false) = true;

  SELECT COUNT(*) INTO v_human_count
  FROM public.match_participants
  WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false AND user_id IS NOT NULL;

  IF m.mode = 'couple' THEN
    SELECT COALESCE(SUM(score), 0) INTO v_team_score
    FROM public.match_participants
    WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false;
    SELECT COALESCE(MAX(score), 0) INTO v_ai_score
    FROM public.match_participants
    WHERE match_id = p_match_id AND COALESCE(is_ai, false) = true;

    IF v_team_score > v_ai_score THEN
      -- couple wins: winner_id stays null, mark via results only (shared win)
      v_winner := NULL;
      -- use special: store couple win as first human id for rewards direction
      SELECT user_id INTO v_winner FROM public.match_participants
      WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false AND user_id IS NOT NULL
      LIMIT 1;
      -- Actually both humans should get "won" — handle in loop via team comparison flag
    ELSIF v_team_score < v_ai_score THEN
      v_winner := NULL; -- AI wins, humans lose
    ELSE
      v_winner := NULL; -- draw
    END IF;
  ELSIF m.mode = 'solo' THEN
    IF v_top_human > v_top_ai THEN
      SELECT user_id INTO v_winner FROM public.match_participants
      WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false
      ORDER BY score DESC LIMIT 1;
    ELSIF v_top_ai > v_top_human THEN
      v_winner := NULL; -- AI wins (no human winner)
    ELSE
      v_winner := NULL; -- draw
    END IF;
  ELSE
    -- 1v1 human vs human
    SELECT user_id INTO v_winner
    FROM public.match_participants
    WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false AND user_id IS NOT NULL
    ORDER BY score DESC LIMIT 1;
    IF (
      SELECT COUNT(*) FROM (
        SELECT score FROM public.match_participants
        WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false
        ORDER BY score DESC LIMIT 2
      ) t
    ) >= 2 THEN
      IF (
        SELECT COUNT(DISTINCT score) FROM (
          SELECT score FROM public.match_participants
          WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false
          ORDER BY score DESC LIMIT 2
        ) top2
      ) = 1 THEN
        v_winner := NULL;
      END IF;
    END IF;
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
    IF m.mode = 'couple' THEN
      v_draw := (v_team_score = v_ai_score);
      v_won := (v_team_score > v_ai_score);
    ELSIF m.mode = 'solo' THEN
      v_draw := (v_top_human = v_top_ai);
      v_won := (v_top_human > v_top_ai);
    ELSE
      v_draw := (v_winner IS NULL);
      v_won := (v_winner IS NOT NULL AND p.user_id = v_winner);
    END IF;

    v_xp := CASE WHEN v_draw THEN 30 WHEN v_won THEN 50 ELSE 20 END;
    v_coins := CASE WHEN v_draw THEN 25 WHEN v_won THEN 50 ELSE 15 END;

    SELECT id INTO v_existing FROM public.xp_events
    WHERE user_id = p.user_id
      AND (
        reference_id = p_match_id::text
        OR match_id = p_match_id
      )
      AND COALESCE(type, source) IN ('match_finish', 'match')
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

      INSERT INTO public.xp_events (user_id, source, amount, match_id, type, reference_id)
      VALUES (p.user_id, 'match_finish', v_xp, p_match_id, 'match_finish', p_match_id::text);

      BEGIN
        INSERT INTO public.wallet_ledger (user_id, amount, type, reference_id, balance_after)
        VALUES (p.user_id, v_coins, 'match_reward', p_match_id::text, v_bal);
      EXCEPTION WHEN OTHERS THEN NULL;
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

  IF m.mode = 'couple' AND m.couple_id IS NOT NULL THEN
    UPDATE public.couples SET
      shared_matches = COALESCE(shared_matches, 0) + 1,
      shared_wins = COALESCE(shared_wins, 0) + CASE WHEN v_team_score > v_ai_score THEN 1 ELSE 0 END,
      last_played_at = v_now,
      last_match_id = p_match_id,
      updated_at = v_now
    WHERE id = m.couple_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'winner_id', v_winner,
    'team_score', v_team_score,
    'ai_score', CASE WHEN m.mode IN ('solo', 'couple') THEN COALESCE(v_ai_score, v_top_ai) ELSE NULL END,
    'rewards', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_match(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_match(UUID) TO service_role;

-- 6) claim_matchmaking respects difficulty
CREATE OR REPLACE FUNCTION public.claim_matchmaking_opponent(
  p_user_id UUID,
  p_difficulty TEXT DEFAULT 'normal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp UUID;
BEGIN
  SELECT user_id INTO v_opp
  FROM public.matchmaking_queue
  WHERE status = 'queued'
    AND user_id <> p_user_id
    AND (difficulty = p_difficulty OR p_difficulty IS NULL)
  ORDER BY joined_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_opp IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.matchmaking_queue
  SET status = 'matched', updated_at = now()
  WHERE user_id = v_opp AND status = 'queued';

  RETURN v_opp;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_matchmaking_opponent(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_matchmaking_opponent(UUID, TEXT) TO service_role;
