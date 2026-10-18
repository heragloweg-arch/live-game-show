-- Sprint 2 privacy hardening: separate public leaderboard identity from private profile/economy data.
DROP POLICY IF EXISTS profiles_select_public_basic ON public.profiles;
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_barrier = true)
AS
SELECT id, username, display_name, avatar_url, level, xp, xp_to_next,
       wins, losses, total_matches, created_at, is_creator, creator_bio
FROM public.profiles;
REVOKE ALL ON TABLE public.public_profiles FROM PUBLIC;
GRANT SELECT ON TABLE public.public_profiles TO anon, authenticated;
