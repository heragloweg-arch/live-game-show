-- Sprint 2: remove table privileges that bypass row-level policies or enable schema manipulation.
-- RLS does not protect against TRUNCATE; clients must never own structural/table-level privileges.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %I.%I FROM PUBLIC, anon, authenticated', t.nspname, t.relname);
  END LOOP;
END
$$;

-- The room-membership helper is internal and must not be callable directly by API client roles.
REVOKE USAGE ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_current_user_room_member(uuid) FROM PUBLIC, anon, authenticated;

-- Keep all public tables under RLS. This is intentionally an assertion rather than auto-enabling
-- RLS silently on any future table whose policies have not been reviewed.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
  LOOP
    RAISE EXCEPTION 'Sprint 2 security assertion failed: public table % has RLS disabled', t.relname;
  END LOOP;
END
$$;
