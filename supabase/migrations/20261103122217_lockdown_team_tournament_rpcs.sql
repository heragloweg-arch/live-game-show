-- Close a live privilege drift: tournament settlement/mutation RPCs are Edge/service-role only.
-- get_public_profiles remains intentionally public and is not part of this lockdown.
REVOKE ALL ON FUNCTION public.join_tournament_team_atomic(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_team_round_robin(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_tournament_team_result(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.distribute_team_tournament_prizes(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_tournament_team_match(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.join_tournament_team_atomic(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_team_round_robin(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_tournament_team_result(UUID, UUID, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.distribute_team_tournament_prizes(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_tournament_team_match(UUID, UUID) TO service_role;
