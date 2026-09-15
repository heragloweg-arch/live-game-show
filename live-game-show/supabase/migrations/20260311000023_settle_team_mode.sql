-- Extend settle_match for team vs team (sum scores per side)

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
  v_score_a INT := 0;
  v_score_b INT := 0;
  v_winning_side TEXT;
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

  IF m.mode = 'team' THEN
    SELECT COALESCE(SUM(score), 0) INTO v_score_a
    FROM public.match_participants
    WHERE match_id = p_match_id AND side IN ('team_a', 'player') AND COALESCE(is_ai, false) = false;
    SELECT COALESCE(SUM(score), 0) INTO v_score_b
    FROM public.match_participants
    WHERE match_id = p_match_id AND side IN ('team_b', 'opponent') AND COALESCE(is_ai, false) = false;

    IF v_score_a > v_score_b THEN
      v_winning_side := 'team_a';
      SELECT user_id INTO v_winner FROM public.match_participants
      WHERE match_id = p_match_id AND side IN ('team_a', 'player') AND user_id IS NOT NULL
      ORDER BY score DESC LIMIT 1;
    ELSIF v_score_b > v_score_a THEN
      v_winning_side := 'team_b';
      SELECT user_id INTO v_winner FROM public.match_participants
      WHERE match_id = p_match_id AND side IN ('team_b', 'opponent') AND user_id IS NOT NULL
      ORDER BY score DESC LIMIT 1;
    ELSE
      v_winning_side := NULL;
      v_winner := NULL;
    END IF;

  ELSIF m.mode = 'couple' THEN
    SELECT COALESCE(SUM(score), 0) INTO v_team_score
    FROM public.match_participants
    WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false;
    SELECT COALESCE(MAX(score), 0) INTO v_ai_score
    FROM public.match_participants
    WHERE match_id = p_match_id AND COALESCE(is_ai, false) = true;
    IF v_team_score > v_ai_score THEN
      SELECT user_id INTO v_winner FROM public.match_participants
      WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false AND user_id IS NOT NULL LIMIT 1;
    ELSE
      v_winner := NULL;
    END IF;

  ELSIF m.mode = 'solo' THEN
    IF v_top_human > v_top_ai THEN
      SELECT user_id INTO v_winner FROM public.match_participants
      WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false
      ORDER BY score DESC LIMIT 1;
    ELSE
      v_winner := NULL;
    END IF;

  ELSE
    SELECT user_id INTO v_winner
    FROM public.match_participants
    WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false AND user_id IS NOT NULL
    ORDER BY score DESC LIMIT 1;
    IF (
      SELECT COUNT(DISTINCT score) FROM (
        SELECT score FROM public.match_participants
        WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false
        ORDER BY score DESC LIMIT 2
      ) top2
    ) = 1 AND (
      SELECT COUNT(*) FROM public.match_participants
      WHERE match_id = p_match_id AND COALESCE(is_ai, false) = false
    ) >= 2 THEN
      v_winner := NULL;
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
    IF m.mode = 'team' THEN
      v_draw := (v_winning_side IS NULL);
      v_won := (
        (v_winning_side IN ('team_a') AND p.side IN ('team_a', 'player'))
        OR (v_winning_side IN ('team_b') AND p.side IN ('team_b', 'opponent'))
      );
    ELSIF m.mode = 'couple' THEN
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
      AND (reference_id = p_match_id::text OR match_id = p_match_id)
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
      'userId', p.user_id, 'won', v_won, 'draw', v_draw, 'xp', v_xp, 'coins', v_coins
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
    'team_score_a', v_score_a,
    'team_score_b', v_score_b,
    'winning_side', v_winning_side,
    'rewards', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_match(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_match(UUID) TO service_role;
