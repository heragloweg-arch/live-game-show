-- Qaddaha team tournament league: max five members, round-robin fixtures,
-- server-authoritative standings and idempotent prize distribution.

UPDATE public.teams SET max_members = LEAST(GREATEST(COALESCE(max_members, 5), 1), 5) WHERE max_members > 5 OR max_members IS NULL;
UPDATE public.team_match_queue SET team_size = LEAST(GREATEST(COALESCE(team_size, 5), 1), 5) WHERE team_size > 5 OR team_size IS NULL;
UPDATE public.team_pickup_queue SET desired_size = LEAST(GREATEST(COALESCE(desired_size, 5), 1), 5) WHERE desired_size > 5 OR desired_size IS NULL;

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_max_members_check;
ALTER TABLE public.teams ADD CONSTRAINT teams_max_members_check CHECK (max_members BETWEEN 1 AND 5);
ALTER TABLE public.team_match_queue DROP CONSTRAINT IF EXISTS team_match_queue_team_size_check;
ALTER TABLE public.team_match_queue ADD CONSTRAINT team_match_queue_team_size_check CHECK (team_size BETWEEN 1 AND 5);
ALTER TABLE public.team_pickup_queue DROP CONSTRAINT IF EXISTS team_pickup_queue_desired_size_check;
ALTER TABLE public.team_pickup_queue ADD CONSTRAINT team_pickup_queue_desired_size_check CHECK (desired_size BETWEEN 1 AND 5);

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS competition_mode TEXT NOT NULL DEFAULT 'player'
    CHECK (competition_mode IN ('player', 'team_league')),
  ADD COLUMN IF NOT EXISTS champion_team_id UUID REFERENCES public.teams(id);

CREATE TABLE IF NOT EXISTS public.tournament_teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id       UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  member_count  INT NOT NULL CHECK (member_count BETWEEN 1 AND 5),
  points        INT NOT NULL DEFAULT 0,
  wins          INT NOT NULL DEFAULT 0,
  draws         INT NOT NULL DEFAULT 0,
  losses        INT NOT NULL DEFAULT 0,
  played        INT NOT NULL DEFAULT 0,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_team_members (
  tournament_team_id UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name       TEXT NOT NULL,
  avatar_url         TEXT,
  PRIMARY KEY (tournament_team_id, user_id)
);

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS team_a_id UUID REFERENCES public.tournament_teams(id),
  ADD COLUMN IF NOT EXISTS team_b_id UUID REFERENCES public.tournament_teams(id),
  ADD COLUMN IF NOT EXISTS winning_team_id UUID REFERENCES public.tournament_teams(id),
  ADD COLUMN IF NOT EXISTS is_draw BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament ON public.tournament_teams(tournament_id, points DESC, wins DESC);
CREATE INDEX IF NOT EXISTS idx_tournament_team_members_user ON public.tournament_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_team_fixture ON public.tournament_matches(tournament_id, team_a_id, team_b_id);

ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_teams_select ON public.tournament_teams;
CREATE POLICY tournament_teams_select ON public.tournament_teams FOR SELECT USING (true);
DROP POLICY IF EXISTS tournament_team_members_select ON public.tournament_team_members;
CREATE POLICY tournament_team_members_select ON public.tournament_team_members FOR SELECT USING (true);

-- A team is registered once. Each member pays the normal entry fee atomically.
CREATE OR REPLACE FUNCTION public.join_tournament_team_atomic(p_tournament_id UUID, p_team_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t public.tournaments%ROWTYPE;
  v_team public.teams%ROWTYPE;
  v_tt public.tournament_teams%ROWTYPE;
  v_count INT;
  v_members INT;
  v_member RECORD;
  v_profile public.profiles%ROWTYPE;
  v_new_balance INT;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
  IF v_t.competition_mode <> 'team_league' THEN RAISE EXCEPTION 'NOT_TEAM_TOURNAMENT'; END IF;
  IF v_t.status <> 'registration' THEN RAISE EXCEPTION 'REGISTRATION_CLOSED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = p_team_id AND user_id = p_user_id AND role = 'owner') THEN
    RAISE EXCEPTION 'TEAM_OWNER_REQUIRED';
  END IF;
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_NOT_FOUND'; END IF;
  SELECT count(*) INTO v_members FROM public.team_members WHERE team_id = p_team_id;
  IF v_members < 1 OR v_members > 5 OR v_members > v_team.max_members THEN RAISE EXCEPTION 'TEAM_SIZE_INVALID'; END IF;
  SELECT * INTO v_tt FROM public.tournament_teams WHERE tournament_id = p_tournament_id AND team_id = p_team_id;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'alreadyJoined', true, 'tournamentTeamId', v_tt.id); END IF;
  SELECT count(*) INTO v_count FROM public.tournament_teams WHERE tournament_id = p_tournament_id;
  IF v_count >= v_t.max_players THEN RAISE EXCEPTION 'TOURNAMENT_FULL'; END IF;

  -- Lock and debit every member, so no half-registered team can exist.
  FOR v_member IN SELECT tm.user_id, p.display_name, p.avatar_url FROM public.team_members tm JOIN public.profiles p ON p.id = tm.user_id WHERE tm.team_id = p_team_id ORDER BY tm.joined_at LOOP
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_member.user_id FOR UPDATE;
    IF COALESCE(v_profile.coins, 0) < v_t.entry_coins THEN RAISE EXCEPTION 'INSUFFICIENT_COINS'; END IF;
  END LOOP;
  INSERT INTO public.tournament_teams(tournament_id, team_id, name, member_count)
    VALUES (p_tournament_id, p_team_id, v_team.name, v_members) RETURNING * INTO v_tt;
  FOR v_member IN SELECT tm.user_id, p.display_name, p.avatar_url FROM public.team_members tm JOIN public.profiles p ON p.id = tm.user_id WHERE tm.team_id = p_team_id ORDER BY tm.joined_at LOOP
    UPDATE public.profiles SET coins = coins - v_t.entry_coins, updated_at = now() WHERE id = v_member.user_id RETURNING coins INTO v_new_balance;
    INSERT INTO public.tournament_team_members(tournament_team_id, user_id, display_name, avatar_url)
      VALUES (v_tt.id, v_member.user_id, COALESCE(v_member.display_name, 'لاعب'), v_member.avatar_url);
    IF v_t.entry_coins > 0 THEN
      INSERT INTO public.wallet_ledger(user_id, amount, type, reference_id, balance_after)
      VALUES (v_member.user_id, -v_t.entry_coins, 'tournament_entry', p_tournament_id::text || ':team:' || p_team_id::text, v_new_balance);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'alreadyJoined', false, 'tournamentTeamId', v_tt.id, 'memberCount', v_members);
END; $$;

-- Build every unique pair once, like a football league fixture list.
CREATE OR REPLACE FUNCTION public.generate_team_round_robin(p_tournament_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t public.tournaments%ROWTYPE;
  a RECORD; b RECORD; v_count INT; v_index INT := 0;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
  IF v_t.competition_mode <> 'team_league' THEN RAISE EXCEPTION 'NOT_TEAM_TOURNAMENT'; END IF;
  SELECT count(*) INTO v_count FROM public.tournament_teams WHERE tournament_id = p_tournament_id;
  IF v_count < 2 THEN RAISE EXCEPTION 'NOT_ENOUGH_TEAMS'; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_matches WHERE tournament_id = p_tournament_id AND status IN ('active','completed')) THEN
    RETURN jsonb_build_object('ok', true, 'alreadyGenerated', true, 'teams', v_count);
  END IF;
  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament_id;
  FOR a IN SELECT id FROM public.tournament_teams WHERE tournament_id = p_tournament_id ORDER BY joined_at LOOP
    FOR b IN SELECT id FROM public.tournament_teams WHERE tournament_id = p_tournament_id AND id > a.id ORDER BY joined_at LOOP
      v_index := v_index + 1;
      INSERT INTO public.tournament_matches(tournament_id, round_number, match_index, team_a_id, team_b_id, status)
        VALUES (p_tournament_id, 1, v_index, a.id, b.id, 'pending');
    END LOOP;
  END LOOP;
  UPDATE public.tournaments SET status = 'active', format = 'round_robin', updated_at = now() WHERE id = p_tournament_id;
  RETURN jsonb_build_object('ok', true, 'generated', v_index, 'teams', v_count);
END; $$;

-- One locked fixture update gives 3 points for a win, 1 for a draw, 0 for a loss.
CREATE OR REPLACE FUNCTION public.report_tournament_team_result(p_tournament_match_id UUID, p_user_id UUID, p_winner_team_id UUID DEFAULT NULL, p_is_draw BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m public.tournament_matches%ROWTYPE;
  v_t public.tournaments%ROWTYPE;
  v_a public.tournament_teams%ROWTYPE;
  v_b public.tournament_teams%ROWTYPE;
  v_pending INT;
  v_champion UUID;
BEGIN
  SELECT * INTO v_m FROM public.tournament_matches WHERE id = p_tournament_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FIXTURE_NOT_FOUND'; END IF;
  IF v_m.status = 'completed' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF p_winner_team_id IS NOT NULL AND p_winner_team_id NOT IN (v_m.team_a_id, v_m.team_b_id) THEN RAISE EXCEPTION 'INVALID_WINNER_TEAM'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournament_team_members WHERE user_id = p_user_id AND tournament_team_id IN (v_m.team_a_id, v_m.team_b_id)) THEN RAISE EXCEPTION 'NOT_A_TEAM_MEMBER'; END IF;
  SELECT * INTO v_t FROM public.tournaments WHERE id = v_m.tournament_id FOR UPDATE;
  SELECT * INTO v_a FROM public.tournament_teams WHERE id = v_m.team_a_id FOR UPDATE;
  SELECT * INTO v_b FROM public.tournament_teams WHERE id = v_m.team_b_id FOR UPDATE;
  UPDATE public.tournament_matches SET status = 'completed', winning_team_id = p_winner_team_id, is_draw = p_is_draw WHERE id = v_m.id;
  UPDATE public.tournament_teams SET played = played + 1, points = points + CASE WHEN p_is_draw THEN 1 WHEN id = p_winner_team_id THEN 3 ELSE 0 END, wins = wins + CASE WHEN NOT p_is_draw AND id = p_winner_team_id THEN 1 ELSE 0 END, draws = draws + CASE WHEN p_is_draw THEN 1 ELSE 0 END, losses = losses + CASE WHEN NOT p_is_draw AND id <> p_winner_team_id THEN 1 ELSE 0 END WHERE id IN (v_m.team_a_id, v_m.team_b_id);
  SELECT count(*) INTO v_pending FROM public.tournament_matches WHERE tournament_id = v_m.tournament_id AND status <> 'completed';
  IF v_pending = 0 THEN
    SELECT id INTO v_champion FROM public.tournament_teams WHERE tournament_id = v_m.tournament_id ORDER BY points DESC, wins DESC, (played - wins - draws) ASC, joined_at LIMIT 1;
    UPDATE public.tournaments SET status = 'completed', champion_team_id = v_champion, updated_at = now() WHERE id = v_m.tournament_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'pending', v_pending, 'championTeamId', v_champion);
END; $$;

-- Pay the whole team prize equally to the snapshot members, once only.
CREATE OR REPLACE FUNCTION public.distribute_team_tournament_prizes(p_tournament_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t public.tournaments%ROWTYPE; v_team UUID; v_members INT; v_each INT; v_remainder INT; v_index INT := 0; m RECORD; v_balance INT; paid JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
  IF v_t.prizes_distributed THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF v_t.status <> 'completed' OR v_t.champion_team_id IS NULL THEN RAISE EXCEPTION 'TOURNAMENT_NOT_COMPLETED'; END IF;
  SELECT count(*) INTO v_members FROM public.tournament_team_members WHERE tournament_team_id = v_t.champion_team_id;
  IF v_members < 1 THEN RAISE EXCEPTION 'CHAMPION_TEAM_EMPTY'; END IF;
  v_each := floor(COALESCE(v_t.prize_pool, 0)::numeric / v_members);
  v_remainder := COALESCE(v_t.prize_pool, 0) - (v_each * v_members);
  FOR m IN SELECT user_id FROM public.tournament_team_members WHERE tournament_team_id = v_t.champion_team_id ORDER BY user_id LOOP
    v_index := v_index + 1;
    UPDATE public.profiles SET coins = coins + v_each + CASE WHEN v_index = 1 THEN v_remainder ELSE 0 END, updated_at = now() WHERE id = m.user_id RETURNING coins INTO v_balance;
    INSERT INTO public.wallet_ledger(user_id, amount, type, reference_id, balance_after) VALUES (m.user_id, v_each + CASE WHEN v_index = 1 THEN v_remainder ELSE 0 END, 'tournament_prize', p_tournament_id::text || ':team:' || v_t.champion_team_id::text, v_balance);
    paid := paid || jsonb_build_object('userId', m.user_id, 'amount', v_each + CASE WHEN v_index = 1 THEN v_remainder ELSE 0 END, 'team', true);
  END LOOP;
  UPDATE public.tournaments SET prizes_distributed = true, settled_at = now(), updated_at = now() WHERE id = p_tournament_id;
  RETURN jsonb_build_object('ok', true, 'paid', paid, 'teamPrizePool', v_t.prize_pool);
END; $$;

-- Convert a league fixture into a real Match engine session exactly once.
CREATE OR REPLACE FUNCTION public.start_tournament_team_match(p_tournament_match_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tm public.tournament_matches%ROWTYPE; v_t public.tournaments%ROWTYPE; v_a UUID; v_b UUID; v_match UUID; v_challenges UUID[];
BEGIN
  SELECT * INTO v_tm FROM public.tournament_matches WHERE id = p_tournament_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FIXTURE_NOT_FOUND'; END IF;
  IF v_tm.match_id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'matchId', v_tm.match_id, 'alreadyStarted', true); END IF;
  IF v_tm.status <> 'pending' THEN RAISE EXCEPTION 'FIXTURE_NOT_AVAILABLE'; END IF;
  SELECT team_id INTO v_a FROM public.tournament_teams WHERE id = v_tm.team_a_id;
  SELECT team_id INTO v_b FROM public.tournament_teams WHERE id = v_tm.team_b_id;
  IF NOT EXISTS (SELECT 1 FROM public.tournament_team_members WHERE user_id = p_user_id AND tournament_team_id IN (v_tm.team_a_id, v_tm.team_b_id)) THEN RAISE EXCEPTION 'NOT_A_TEAM_MEMBER'; END IF;
  SELECT * INTO v_t FROM public.tournaments WHERE id = v_tm.tournament_id;
  SELECT array_agg(id) INTO v_challenges FROM (SELECT id FROM public.challenges WHERE active = true AND qa_status = 'approved' AND difficulty = v_t.difficulty ORDER BY random() LIMIT 5) q;
  IF COALESCE(cardinality(v_challenges), 0) < 5 THEN RAISE EXCEPTION 'NOT_ENOUGH_PLAYABLE_CHALLENGES'; END IF;
  INSERT INTO public.matches(mode, status, difficulty, current_round, total_rounds, sequence, started_at, server_now, team_size, team_a_id, team_b_id)
    VALUES ('team', 'VS', v_t.difficulty, 1, 5, 1, now(), now(), 5, v_a, v_b) RETURNING id INTO v_match;
  INSERT INTO public.match_participants(match_id, user_id, side, username, avatar_url)
    SELECT v_match, user_id, CASE WHEN tournament_team_id = v_tm.team_a_id THEN 'team_a'::public.participant_side ELSE 'team_b'::public.participant_side END, display_name, avatar_url
    FROM public.tournament_team_members WHERE tournament_team_id IN (v_tm.team_a_id, v_tm.team_b_id);
  INSERT INTO public.rounds(match_id, round_number, challenge_id, status, sequence)
    SELECT v_match, n, v_challenges[n], 'pending', 0 FROM generate_series(1, 5) n;
  UPDATE public.tournament_matches SET match_id = v_match, status = 'active' WHERE id = v_tm.id;
  RETURN jsonb_build_object('ok', true, 'matchId', v_match, 'alreadyStarted', false);
END; $$;

REVOKE ALL ON FUNCTION public.join_tournament_team_atomic(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_team_round_robin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_tournament_team_result(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.distribute_team_tournament_prizes(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_tournament_team_match(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_tournament_team_atomic(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_team_round_robin(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_tournament_team_result(UUID, UUID, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.distribute_team_tournament_prizes(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_tournament_team_match(UUID, UUID) TO service_role;

-- Team-league seed: max_players means maximum number of registered teams.
INSERT INTO public.tournaments (slug, title, description, status, max_players, entry_coins, prize_pool, rounds_total, difficulty, format, competition_mode, starts_at, ends_at)
VALUES ('teams-s1', 'دوري فرق قدها — الموسم الأول', 'دوري كرة قدم: كل فريق يواجه كل فريق، 3 نقاط للفوز ونقطة للتعادل، والكأس للفريق الأعلى.', 'registration', 8, 25, 5000, 1, 'normal', 'round_robin', 'team_league', now(), now() + interval '14 days')
ON CONFLICT (slug) DO UPDATE SET competition_mode = 'team_league', format = 'round_robin', max_players = 8;
