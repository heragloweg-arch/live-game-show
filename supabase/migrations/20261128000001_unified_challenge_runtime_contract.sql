-- Qaddaha unified challenge runtime contract
-- 20 seconds per question; 10 unique questions per room/tournament/team fixture.
-- Solo leaves remain exactly three questions by their dedicated contract.
BEGIN;

-- The runtime contract is global so old approved rows cannot silently fall back to 15s.
UPDATE public.challenges
SET time_limit_ms = 20000,
    updated_at = now();

-- Release only the existing official-country flag set whose choices contain exactly
-- one correct country. No island or unreviewed bulk bank is activated here.
UPDATE public.challenges AS c
SET active = true,
    qa_status = 'approved',
    time_limit_ms = 20000,
    updated_at = now()
WHERE c.asset_path IN (
  '/flags/sa.svg', '/flags/eg.svg', '/flags/ae.svg', '/flags/qa.svg',
  '/flags/jo.svg', '/flags/tn.svg', '/flags/tr.svg', '/flags/jp.svg',
  '/flags/br.svg', '/flags/ca.svg', '/flags/gb.svg', '/flags/us.svg'
)
AND (
  SELECT count(*)
  FROM public.challenge_choices cc
  WHERE cc.challenge_id = c.id AND cc.is_correct = true
) = 1;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS round_limit INT NOT NULL DEFAULT 10;

UPDATE public.rooms SET round_limit = 10 WHERE round_limit IS DISTINCT FROM 10;

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_round_limit_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_round_limit_check CHECK (round_limit = 10);

-- Tournament metadata is explicit; the actual match rows below also enforce ten rounds.
UPDATE public.tournaments
SET rounds_total = 10,
    updated_at = now()
WHERE competition_mode IN ('player', 'team_league')
   OR slug IN ('champions-s1', 'teams-s1');

-- Player tournament fixture: ten distinct, approved, playable questions.
CREATE OR REPLACE FUNCTION public.start_bracket_match(p_tournament_match_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_tm public.tournament_matches%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_match UUID;
  v_challenges UUID[];
BEGIN
  SELECT * INTO v_tm FROM public.tournament_matches WHERE id = p_tournament_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_MATCH_NOT_FOUND'; END IF;
  IF p_user_id <> v_tm.player_a AND p_user_id <> v_tm.player_b THEN RAISE EXCEPTION 'NOT_A_MATCH_PLAYER'; END IF;
  IF v_tm.status = 'completed' THEN RAISE EXCEPTION 'MATCH_COMPLETED'; END IF;
  IF v_tm.match_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'matchId', v_tm.match_id, 'alreadyStarted', true);
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_tm.tournament_id;
  SELECT array_agg(x.id ORDER BY x.order_key) INTO v_challenges
  FROM (
    SELECT c.id, random() AS order_key
    FROM public.challenges c
    WHERE c.active = true
      AND c.qa_status = 'approved'
      AND c.difficulty = v_tournament.difficulty
      AND c.letter_pool IS NOT NULL
      AND cardinality(c.letter_pool) > 0
      AND c.max_length IS NOT NULL
      AND c.max_length BETWEEN 1 AND cardinality(c.letter_pool)
    ORDER BY order_key
    LIMIT 10
  ) x;
  IF COALESCE(cardinality(v_challenges), 0) < 10 THEN RAISE EXCEPTION 'NOT_ENOUGH_PLAYABLE_CHALLENGES'; END IF;

  INSERT INTO public.matches(mode, status, difficulty, current_round, total_rounds, sequence, started_at, server_now)
  VALUES ('1v1', 'VS', v_tournament.difficulty, 1, 10, 1, now(), now()) RETURNING id INTO v_match;

  INSERT INTO public.match_participants(match_id, user_id, side, username, avatar_url)
    SELECT v_match, p.id,
      CASE WHEN p.id = v_tm.player_a THEN 'player'::public.participant_side ELSE 'opponent'::public.participant_side END,
      COALESCE(p.username, p.id::text), p.avatar_url
    FROM public.profiles p WHERE p.id IN (v_tm.player_a, v_tm.player_b)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.rounds(match_id, round_number, challenge_id, status, sequence)
    SELECT v_match, n, v_challenges[n], 'pending', 0 FROM generate_series(1, 10) AS n;

  UPDATE public.tournament_matches SET match_id = v_match, status = 'active' WHERE id = p_tournament_match_id;
  RETURN jsonb_build_object('ok', true, 'matchId', v_match, 'alreadyStarted', false, 'totalRounds', 10);
END; $$;

-- Team tournament fixture: the same ten-question contract and no repeated challenge id.
CREATE OR REPLACE FUNCTION public.start_tournament_team_match(p_tournament_match_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_tm public.tournament_matches%ROWTYPE;
  v_t public.tournaments%ROWTYPE;
  v_a UUID; v_b UUID; v_match UUID; v_challenges UUID[];
BEGIN
  SELECT * INTO v_tm FROM public.tournament_matches WHERE id = p_tournament_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FIXTURE_NOT_FOUND'; END IF;
  IF v_tm.match_id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'matchId', v_tm.match_id, 'alreadyStarted', true); END IF;
  IF v_tm.status <> 'pending' THEN RAISE EXCEPTION 'FIXTURE_NOT_AVAILABLE'; END IF;
  SELECT team_id INTO v_a FROM public.tournament_teams WHERE id = v_tm.team_a_id;
  SELECT team_id INTO v_b FROM public.tournament_teams WHERE id = v_tm.team_b_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_team_members
    WHERE user_id = p_user_id AND tournament_team_id IN (v_tm.team_a_id, v_tm.team_b_id)
  ) THEN RAISE EXCEPTION 'NOT_A_TEAM_MEMBER'; END IF;
  SELECT * INTO v_t FROM public.tournaments WHERE id = v_tm.tournament_id;

  SELECT array_agg(q.id ORDER BY q.order_key) INTO v_challenges
  FROM (
    SELECT c.id, random() AS order_key
    FROM public.challenges c
    WHERE c.active = true
      AND c.qa_status = 'approved'
      AND c.difficulty = v_t.difficulty
      AND c.letter_pool IS NOT NULL
      AND cardinality(c.letter_pool) > 0
      AND c.max_length IS NOT NULL
      AND c.max_length BETWEEN 1 AND cardinality(c.letter_pool)
    ORDER BY order_key
    LIMIT 10
  ) q;
  IF COALESCE(cardinality(v_challenges), 0) < 10 THEN RAISE EXCEPTION 'NOT_ENOUGH_PLAYABLE_CHALLENGES'; END IF;

  INSERT INTO public.matches(mode, status, difficulty, current_round, total_rounds, sequence, started_at, server_now, team_size, team_a_id, team_b_id)
    VALUES ('team', 'VS', v_t.difficulty, 1, 10, 1, now(), now(), 5, v_a, v_b) RETURNING id INTO v_match;
  INSERT INTO public.match_participants(match_id, user_id, side, username, avatar_url)
    SELECT v_match, user_id,
      CASE WHEN tournament_team_id = v_tm.team_a_id THEN 'team_a'::public.participant_side ELSE 'team_b'::public.participant_side END,
      display_name, avatar_url
    FROM public.tournament_team_members
    WHERE tournament_team_id IN (v_tm.team_a_id, v_tm.team_b_id);
  INSERT INTO public.rounds(match_id, round_number, challenge_id, status, sequence)
    SELECT v_match, n, v_challenges[n], 'pending', 0 FROM generate_series(1, 10) n;
  UPDATE public.tournament_matches SET match_id = v_match, status = 'active' WHERE id = v_tm.id;
  RETURN jsonb_build_object('ok', true, 'matchId', v_match, 'alreadyStarted', false, 'totalRounds', 10);
END; $$;

REVOKE ALL ON FUNCTION public.start_bracket_match(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_bracket_match(UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.start_tournament_team_match(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_tournament_team_match(UUID, UUID) TO service_role;

COMMIT;
