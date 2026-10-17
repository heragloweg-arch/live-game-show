-- Harden privileged RPCs before exposing the current production source.
-- Trigger functions remain callable by PostgreSQL triggers; client EXECUTE is unnecessary.
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.credit_coins(UUID, INT, TEXT, TEXT) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.credit_coins(UUID, INT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coins(UUID, INT, TEXT, TEXT) TO service_role;

ALTER FUNCTION public.protect_profile_columns() SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.rls_auto_enable() SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.atomic_start_round(UUID, INTEGER) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.atomic_start_round(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_start_round(UUID, INTEGER) TO service_role;

ALTER FUNCTION public.complete_daily_atomic(UUID, DATE, UUID, TEXT, INTEGER, INTEGER, INTEGER)
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.complete_daily_atomic(UUID, DATE, UUID, TEXT, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_atomic(UUID, DATE, UUID, TEXT, INTEGER, INTEGER, INTEGER)
  TO service_role;

ALTER FUNCTION public.distribute_tournament_prizes(UUID) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.distribute_tournament_prizes(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_tournament_prizes(UUID) TO service_role;

ALTER FUNCTION public.claim_matchmaking_opponent(UUID, TEXT) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.claim_matchmaking_opponent(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_matchmaking_opponent(UUID, TEXT) TO service_role;

ALTER FUNCTION public.claim_matchmaking_opponent(UUID, TEXT, TEXT) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.claim_matchmaking_opponent(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_matchmaking_opponent(UUID, TEXT, TEXT) TO service_role;

ALTER FUNCTION public.round_submission_count(UUID) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.round_submission_count(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.round_submission_count(UUID) TO service_role;

ALTER FUNCTION public.match_human_count(UUID) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.match_human_count(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_human_count(UUID) TO service_role;
