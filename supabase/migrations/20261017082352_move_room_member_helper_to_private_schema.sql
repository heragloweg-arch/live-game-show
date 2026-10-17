-- Keep the room-membership SECURITY DEFINER helper out of the exposed public API schema.
-- RLS policies still call it, but clients cannot reach it through public RPC endpoints.
begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_current_user_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select exists (
    select 1 from public.rooms r
    where r.id = p_room_id and r.host_id = auth.uid()
  ) or exists (
    select 1 from public.room_participants rp
    where rp.room_id = p_room_id and rp.user_id = auth.uid()
  );
$function$;

revoke all on function private.is_current_user_room_member(uuid) from public;
grant execute on function private.is_current_user_room_member(uuid) to anon, authenticated, service_role;

alter policy rooms_select on public.rooms
  using (private.is_current_user_room_member(id));
alter policy room_participants_select on public.room_participants
  using (private.is_current_user_room_member(room_id));
alter policy room_rounds_select on public.room_rounds
  using (private.is_current_user_room_member(room_id));

drop function if exists public.is_current_user_room_member(uuid);

commit;
