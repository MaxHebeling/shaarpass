-- Fase 2 — Vistas geo + RPCs del editor de mapas.
create or replace view public.zones_geo with (security_invoker = true) as
  select id, map_id, name, kind, color, ga_capacity, display_order,
         extensions.ST_AsGeoJSON(area) as area_geojson
  from public.zones;

create or replace view public.venue_seats_geo with (security_invoker = true) as
  select id, map_id, zone_id, row_id, label,
         extensions.ST_X(pos) as x, extensions.ST_Y(pos) as y, rotation
  from public.venue_seats;

-- save_zone: crea una zona desde un array de puntos [[x,y],...] (construye el polígono).
create or replace function public.save_zone(p_map uuid, p_name text, p_kind text, p_color text, p_points jsonb, p_ga_capacity int default null)
returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare v_zone uuid; wkt text := ''; pt jsonb; first jsonb;
begin
  if not public.is_org_member(public.map_org(p_map), array['owner','admin','staff']) then raise exception 'no autorizado' using errcode='insufficient_privilege'; end if;
  if jsonb_array_length(p_points) < 3 then raise exception 'polígono inválido' using errcode='check_violation'; end if;
  for pt in select * from jsonb_array_elements(p_points) loop wkt := wkt || (pt->>0) || ' ' || (pt->>1) || ','; end loop;
  first := p_points->0; wkt := wkt || (first->>0) || ' ' || (first->>1);
  insert into public.zones (map_id, name, kind, color, ga_capacity, area)
  values (p_map, p_name, p_kind, coalesce(p_color,'#7c3aed'), p_ga_capacity, extensions.ST_GeomFromText('POLYGON((' || wkt || '))', 0))
  returning id into v_zone;
  return v_zone;
end $$;

-- generate_zone_seats: grilla de asientos dentro de una zona.
create or replace function public.generate_zone_seats(p_zone uuid, p_rows int, p_cols int, p_row_start text default 'A', p_seat_start int default 1, p_origin_x numeric default 0, p_origin_y numeric default 0, p_dx numeric default 1, p_dy numeric default 1)
returns int language plpgsql security definer set search_path = public, extensions
as $$
declare v_map uuid; r int; c int; n int := 0; v_row uuid; v_label text;
begin
  select map_id into v_map from public.zones where id = p_zone;
  if v_map is null then raise exception 'zona no existe' using errcode='no_data_found'; end if;
  if not public.is_org_member(public.map_org(v_map), array['owner','admin','staff']) then raise exception 'no autorizado' using errcode='insufficient_privilege'; end if;
  if p_rows < 1 or p_cols < 1 or p_rows*p_cols > 5000 then raise exception 'dimensiones inválidas' using errcode='check_violation'; end if;
  for r in 0..(p_rows-1) loop
    v_label := chr(ascii(p_row_start) + r);
    insert into public.rows (zone_id, label, display_order) values (p_zone, v_label, r) returning id into v_row;
    for c in 0..(p_cols-1) loop
      insert into public.venue_seats (map_id, zone_id, row_id, label, pos)
      values (v_map, p_zone, v_row, (p_seat_start + c)::text, extensions.ST_SetSRID(extensions.ST_MakePoint(p_origin_x + c*p_dx, p_origin_y + r*p_dy), 0));
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

create or replace function public.delete_zone(p_zone uuid)
returns void language plpgsql security definer set search_path = public, extensions
as $$
declare v_map uuid;
begin
  select map_id into v_map from public.zones where id = p_zone;
  if not public.is_org_member(public.map_org(v_map), array['owner','admin','staff']) then raise exception 'no autorizado' using errcode='insufficient_privilege'; end if;
  delete from public.zones where id = p_zone;
end $$;

create or replace function public.publish_map(p_map uuid)
returns void language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_org_member(public.map_org(p_map), array['owner','admin','staff']) then raise exception 'no autorizado' using errcode='insufficient_privilege'; end if;
  update public.venue_maps set status='published' where id = p_map;
end $$;

revoke execute on function public.save_zone(uuid,text,text,text,jsonb,int) from public, anon;
revoke execute on function public.generate_zone_seats(uuid,int,int,text,int,numeric,numeric,numeric,numeric) from public, anon;
revoke execute on function public.delete_zone(uuid) from public, anon;
revoke execute on function public.publish_map(uuid) from public, anon;
grant execute on function public.save_zone(uuid,text,text,text,jsonb,int) to authenticated, service_role;
grant execute on function public.generate_zone_seats(uuid,int,int,text,int,numeric,numeric,numeric,numeric) to authenticated, service_role;
grant execute on function public.delete_zone(uuid) to authenticated, service_role;
grant execute on function public.publish_map(uuid) to authenticated, service_role;
