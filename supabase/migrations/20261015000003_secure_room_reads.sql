-- Restrict room metadata and live-round visibility to authenticated room members.
-- Room discovery remains through the authenticated voice.join_room Edge Function.
CREATE OR REPLACE FUNCTION public.is_current_user_room_member(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = p_room_id AND r.host_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.room_participants rp
    WHERE rp.room_id = p_room_id AND rp.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_room_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_room_member(UUID) TO authenticated;

DROP POLICY IF EXISTS rooms_select ON public.rooms;
CREATE POLICY rooms_select ON public.rooms FOR SELECT
  USING (public.is_current_user_room_member(id));

DROP POLICY IF EXISTS room_participants_select ON public.room_participants;
CREATE POLICY room_participants_select ON public.room_participants FOR SELECT
  USING (public.is_current_user_room_member(room_id));

DROP POLICY IF EXISTS room_rounds_select ON public.room_rounds;
CREATE POLICY room_rounds_select ON public.room_rounds FOR SELECT
  USING (public.is_current_user_room_member(room_id));
