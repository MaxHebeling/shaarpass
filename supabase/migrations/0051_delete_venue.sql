create or replace function public.delete_venue(p_venue uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.venues_v2 v join public.org_members m on m.org_id = v.org_id where v.id = p_venue and m.user_id = auth.uid()) then
    raise exception 'no autorizado';
  end if;
  if exists (select 1 from public.event_maps em join public.venue_maps vm on vm.id = em.map_id where vm.venue_id = p_venue) then
    raise exception 'EN_USO';
  end if;
  delete from public.venues_v2 where id = p_venue;
end; $$;
revoke all on function public.delete_venue(uuid) from anon;
grant execute on function public.delete_venue(uuid) to authenticated;
