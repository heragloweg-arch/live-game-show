-- Forward hardening for privileged routines added by later gameplay migrations.
-- Every listed function is called from trusted Edge Functions using service_role.
-- Client roles must not invoke SECURITY DEFINER economy, settlement, or admin routines directly.

ALTER FUNCTION public.atomic_start_round(UUID, INTEGER) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.atomic_start_round(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_start_round(UUID, INTEGER) TO service_role;

ALTER FUNCTION public.claim_ad_reward_atomic(UUID, TEXT, TEXT, INTEGER, INTEGER) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.claim_ad_reward_atomic(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ad_reward_atomic(UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

ALTER FUNCTION public.claim_subscription_daily_atomic(UUID, TEXT, INTEGER) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.claim_subscription_daily_atomic(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_subscription_daily_atomic(UUID, TEXT, INTEGER) TO service_role;

ALTER FUNCTION public.complete_daily_atomic(UUID, DATE, UUID, TEXT, INTEGER, INTEGER, INTEGER)
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.complete_daily_atomic(UUID, DATE, UUID, TEXT, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_atomic(UUID, DATE, UUID, TEXT, INTEGER, INTEGER, INTEGER)
  TO service_role;

ALTER FUNCTION public.complete_daily_pack_slot_atomic(UUID, UUID, UUID, TEXT, INTEGER)
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.complete_daily_pack_slot_atomic(UUID, UUID, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_pack_slot_atomic(UUID, UUID, UUID, TEXT, INTEGER)
  TO service_role;

ALTER FUNCTION public.distribute_tournament_prizes(UUID) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.distribute_tournament_prizes(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_tournament_prizes(UUID) TO service_role;

ALTER FUNCTION public.grant_creator_approval_reward(UUID, UUID, INTEGER) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.grant_creator_approval_reward(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_creator_approval_reward(UUID, UUID, INTEGER) TO service_role;

ALTER FUNCTION public.join_tournament_atomic(UUID, UUID) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.join_tournament_atomic(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_tournament_atomic(UUID, UUID) TO service_role;

ALTER FUNCTION public.rls_auto_enable() SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.spend_lifeline_fifty(UUID, UUID, UUID, TEXT[]) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.spend_lifeline_fifty(UUID, UUID, UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_lifeline_fifty(UUID, UUID, UUID, TEXT[]) TO service_role;

ALTER FUNCTION public.start_bracket_match(UUID, UUID) SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.start_bracket_match(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_bracket_match(UUID, UUID) TO service_role;

ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.normalize_question_answer(TEXT) SET search_path = pg_catalog;
ALTER FUNCTION public.enforce_playable_challenge_contract() SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.enforce_playable_challenge_contract() FROM PUBLIC, anon, authenticated;
