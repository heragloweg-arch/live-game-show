-- Sprint 2 least-privilege follow-up.
-- These tables intentionally have RLS enabled and no client-facing policies;
-- remove table grants too, so access is server-only rather than relying solely on RLS.
REVOKE ALL PRIVILEGES ON TABLE
  public.lifeline_uses,
  public.security_events,
  public.user_cohorts
FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.lifeline_uses', 'SELECT')
    OR has_table_privilege('anon', 'public.lifeline_uses', 'INSERT')
    OR has_table_privilege('authenticated', 'public.lifeline_uses', 'SELECT')
    OR has_table_privilege('authenticated', 'public.lifeline_uses', 'INSERT')
    OR has_table_privilege('anon', 'public.security_events', 'SELECT')
    OR has_table_privilege('anon', 'public.security_events', 'INSERT')
    OR has_table_privilege('authenticated', 'public.security_events', 'SELECT')
    OR has_table_privilege('authenticated', 'public.security_events', 'INSERT')
    OR has_table_privilege('anon', 'public.user_cohorts', 'SELECT')
    OR has_table_privilege('anon', 'public.user_cohorts', 'INSERT')
    OR has_table_privilege('authenticated', 'public.user_cohorts', 'SELECT')
    OR has_table_privilege('authenticated', 'public.user_cohorts', 'INSERT')
  THEN
    RAISE EXCEPTION 'Sprint 2 assertion failed: server-only tables still grant client privileges';
  END IF;
END $$;
