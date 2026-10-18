-- Sprint 2 production permission assertions.
-- Run with a privileged SQL editor after applying the matching migration.
DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND (
      has_table_privilege('anon', c.oid, 'TRUNCATE')
      OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
      OR has_table_privilege('anon', c.oid, 'TRIGGER')
      OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
      OR has_table_privilege('anon', c.oid, 'REFERENCES')
      OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
    );
  IF bad_count <> 0 THEN
    RAISE EXCEPTION 'Unsafe client table privileges remain on % public tables', bad_count;
  END IF;

  SELECT count(*) INTO bad_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
  IF bad_count <> 0 THEN
    RAISE EXCEPTION 'RLS is disabled on % public tables', bad_count;
  END IF;

  IF has_schema_privilege('anon','private','USAGE')
     OR has_schema_privilege('authenticated','private','USAGE') THEN
    RAISE EXCEPTION 'Client role can use private schema';
  END IF;
  IF has_function_privilege('anon','private.is_current_user_room_member(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','private.is_current_user_room_member(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Client role can execute internal room membership helper';
  END IF;

  IF has_table_privilege('anon','public.profiles','SELECT') THEN
    RAISE EXCEPTION 'Anonymous clients can read the base profiles table';
  END IF;
  IF NOT has_function_privilege('anon','public.get_public_profiles(uuid[],integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_public_profiles(uuid[],integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Public profile allow-list RPC is not executable by client roles';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_public_profiles'
      AND p.prosecdef
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) AS setting(value)
                  WHERE setting.value='search_path=pg_catalog, public, pg_temp')
  ) THEN
    RAISE EXCEPTION 'Public profile RPC is not SECURITY DEFINER with pinned search_path';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='profiles_select_public_basic'
  ) THEN
    RAISE EXCEPTION 'Broad public profile SELECT policy still exists';
  END IF;

  SELECT count(*) INTO bad_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private') AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting(value) WHERE setting.value LIKE 'search_path=%');
  IF bad_count <> 0 THEN
    RAISE EXCEPTION '% SECURITY DEFINER functions lack a pinned search_path', bad_count;
  END IF;
END $$;

SELECT
  'public_tables' AS metric,
  count(*)::text AS value
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
UNION ALL
SELECT 'rls_enabled_tables', count(*)::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity;
