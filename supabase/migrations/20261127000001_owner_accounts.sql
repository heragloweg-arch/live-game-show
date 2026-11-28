-- Official owner accounts for Qaddaha.
-- The flag is derived from auth.users.email and cannot be written by clients.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sync_qaddaha_owner_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.is_owner := lower(COALESCE((SELECT email FROM auth.users WHERE id = NEW.id), '')) IN (
    'sir.market7@gmail.com',
    'miss.market7@gmail.com'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_qaddaha_owner_flag ON public.profiles;
CREATE TRIGGER profiles_sync_qaddaha_owner_flag
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_qaddaha_owner_flag();

UPDATE public.profiles AS p
SET is_owner = lower(COALESCE(u.email, '')) IN ('sir.market7@gmail.com', 'miss.market7@gmail.com'),
    updated_at = now()
FROM auth.users AS u
WHERE u.id = p.id;

REVOKE UPDATE (is_owner) ON public.profiles FROM anon, authenticated;
GRANT SELECT (is_owner) ON public.profiles TO authenticated;
REVOKE ALL ON FUNCTION public.sync_qaddaha_owner_flag() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.sync_qaddaha_owner_flag() TO service_role;
