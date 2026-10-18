-- Replace the owner-privileged public profile view with a narrow, audited RPC.
DROP VIEW IF EXISTS public.public_profiles;
CREATE OR REPLACE FUNCTION public.get_public_profiles(
  p_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid, username text, display_name text, avatar_url text, level integer, xp integer,
  xp_to_next integer, wins integer, losses integer, total_matches integer,
  created_at timestamptz, is_creator boolean, creator_bio text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT p.id, p.username, p.display_name, p.avatar_url, p.level, p.xp, p.xp_to_next,
         p.wins, p.losses, p.total_matches, p.created_at, p.is_creator, p.creator_bio
  FROM public.profiles AS p
  WHERE p_ids IS NULL OR p.id = ANY(p_ids)
  ORDER BY p.wins DESC, p.xp DESC, p.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
$function$;
REVOKE ALL ON FUNCTION public.get_public_profiles(uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[], integer) TO anon, authenticated;
