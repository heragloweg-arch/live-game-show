-- Sprint 2: remove table privileges that bypass row-level policies or enable schema manipulation.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %I.%I FROM PUBLIC, anon, authenticated',t.nspname,t.relname);
  END LOOP;
END $$;
REVOKE USAGE ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_current_user_room_member(uuid) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity
  LOOP
    RAISE EXCEPTION 'Sprint 2 security assertion failed: public table % has RLS disabled',t.relname;
  END LOOP;
END $$;
