-- Account deletion and server-side rate limiting.
-- All destructive account work is server-role only and runs before auth.admin.deleteUser.

ALTER TABLE public.security_events
  DROP CONSTRAINT IF EXISTS security_events_user_id_fkey;
ALTER TABLE public.security_events
  ADD CONSTRAINT security_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  subject_key TEXT NOT NULL,
  action TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INT NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (subject_key, action)
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_buckets FROM anon, authenticated;
GRANT ALL ON public.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit_atomic(
  p_subject_key TEXT,
  p_action TEXT,
  p_limit INT,
  p_window_seconds INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row public.rate_limit_buckets;
  v_now TIMESTAMPTZ := now();
  v_reset BOOLEAN;
  v_hits INT;
BEGIN
  IF NULLIF(trim(p_subject_key), '') IS NULL OR NULLIF(trim(p_action), '') IS NULL
     OR p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_REQUEST';
  END IF;

  INSERT INTO public.rate_limit_buckets(subject_key, action, window_started_at, hits)
  VALUES (trim(p_subject_key), trim(p_action), v_now, 1)
  ON CONFLICT (subject_key, action) DO UPDATE
  SET hits = CASE
      WHEN v_now >= public.rate_limit_buckets.window_started_at + make_interval(secs => p_window_seconds)
        THEN 1
      ELSE public.rate_limit_buckets.hits + 1
    END,
    window_started_at = CASE
      WHEN v_now >= public.rate_limit_buckets.window_started_at + make_interval(secs => p_window_seconds)
        THEN v_now
      ELSE public.rate_limit_buckets.window_started_at
    END
  RETURNING * INTO v_row;

  v_reset := v_row.window_started_at = v_now;
  v_hits := v_row.hits;
  RETURN jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits', v_hits,
    'limit', p_limit,
    'window_seconds', p_window_seconds,
    'reset_at', v_row.window_started_at + make_interval(secs => p_window_seconds)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit_atomic(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit_atomic(TEXT, TEXT, INT, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_account_data_atomic(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rooms INT := 0;
  v_answers INT := 0;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_USER_ID'; END IF;

  -- Remove rooms owned by the user first; room children are intentionally deleted with the room.
  DELETE FROM public.rooms WHERE host_id = p_user_id;
  GET DIAGNOSTICS v_rooms = ROW_COUNT;

  -- Remove personal answer records and queue membership; preserve aggregate matches.
  DELETE FROM public.answer_submissions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_answers = ROW_COUNT;
  DELETE FROM public.room_answers WHERE user_id = p_user_id;
  DELETE FROM public.room_participants WHERE user_id = p_user_id;
  DELETE FROM public.matchmaking_queue WHERE user_id = p_user_id;
  DELETE FROM public.team_match_queue WHERE owner_id = p_user_id;
  DELETE FROM public.xp_events WHERE user_id = p_user_id;

  -- Teams are owned rows and may be referenced by historical matches.
  UPDATE public.matches
  SET team_a_id = NULL
  WHERE team_a_id IN (SELECT id FROM public.teams WHERE owner_id = p_user_id);
  UPDATE public.matches
  SET team_b_id = NULL
  WHERE team_b_id IN (SELECT id FROM public.teams WHERE owner_id = p_user_id);

  -- Keep competitive history but remove the deleted user's identity.
  UPDATE public.match_participants
  SET user_id = NULL, username = 'لاعب محذوف', avatar_url = NULL
  WHERE user_id = p_user_id;
  UPDATE public.matches SET winner_id = NULL WHERE winner_id = p_user_id;
  UPDATE public.tournaments SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.tournament_matches SET player_a = NULL WHERE player_a = p_user_id;
  UPDATE public.tournament_matches SET player_b = NULL WHERE player_b = p_user_id;
  UPDATE public.tournament_matches SET winner_id = NULL WHERE winner_id = p_user_id;
  UPDATE public.challenges SET reviewed_by = NULL WHERE reviewed_by = p_user_id;
  UPDATE public.security_events SET user_id = NULL WHERE user_id = p_user_id;

  -- The profile delete cascades owned economy, billing, cosmetics, teams, creator and daily rows.
  DELETE FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  RETURN jsonb_build_object('ok', true, 'rooms_deleted', v_rooms, 'answers_deleted', v_answers);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_account_data_atomic(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data_atomic(UUID) TO service_role;
