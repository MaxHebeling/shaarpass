-- Fase 5 — Captura asistida (Nivel A): storage de planos + calibración de escala.
insert into storage.buckets (id, name, public) values ('venue-plans', 'venue-plans', true)
on conflict (id) do nothing;

create policy "venue_plans_public_read" on storage.objects
  for select using (bucket_id = 'venue-plans');
create policy "venue_plans_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'venue-plans');
create policy "venue_plans_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'venue-plans');

-- Recalibra el mapa: escala dimensiones + toda la geometría (zonas + asientos)
-- por factor = metros_reales / unidades_del_segmento_marcado.
create or replace function public.recalibrate_map(p_map uuid, p_factor numeric)
returns void language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_org_member(public.map_org(p_map), array['owner','admin','staff']) then
    raise exception 'no autorizado' using errcode='insufficient_privilege';
  end if;
  if p_factor <= 0 or p_factor > 10000 then raise exception 'factor inválido' using errcode='check_violation'; end if;
  update public.venue_maps set width_m = width_m * p_factor, height_m = height_m * p_factor where id = p_map;
  update public.zones set area = extensions.ST_Scale(area, p_factor, p_factor) where map_id = p_map and area is not null;
  update public.venue_seats set pos = extensions.ST_Scale(pos, p_factor, p_factor) where map_id = p_map;
end $$;

revoke execute on function public.recalibrate_map(uuid, numeric) from public, anon;
grant execute on function public.recalibrate_map(uuid, numeric) to authenticated, service_role;
