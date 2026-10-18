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
    RAISE EXCEPTION 'Anonymous clients can read private base profile rows';
  END IF;
  IF NOT has_table_privilege('anon','public.public_profiles','SELECT')
     OR NOT has_table_privilege('authenticated','public.public_profiles','SELECT') THEN
    RAISE EXCEPTION 'Public profile allow-list view is not readable by client roles';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='public_profiles'
      AND column_name IN ('coins','subscription_plan','subscription_expires_at','onboarding_done')
  ) THEN
    RAISE EXCEPTION 'Public profile view exposes private economy/subscription columns';
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
