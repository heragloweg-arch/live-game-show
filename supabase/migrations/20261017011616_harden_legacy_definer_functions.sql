-- Applied on production 2026-10-17; version retained to match Supabase migration ledger.
ALTER FUNCTION public.handle_new_user()
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.credit_coins(UUID, INT, TEXT, TEXT)
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.credit_coins(UUID, INT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coins(UUID, INT, TEXT, TEXT) TO service_role;

ALTER FUNCTION public.protect_profile_columns()
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.round_submission_count(UUID)
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.round_submission_count(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.round_submission_count(UUID) TO service_role;

ALTER FUNCTION public.match_human_count(UUID)
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.match_human_count(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_human_count(UUID) TO service_role;
