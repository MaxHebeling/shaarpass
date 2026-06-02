-- Fase 1 — Migración de datos: modelo `seats` (grilla) → venue_seats + event_seats.
-- Por cada evento con asientos: crea venue + mapa + zona(por tier) + filas +
-- asientos geométricos (ST_MakePoint) + estado de venta por evento, preservando status.
-- (Corrida como data migration; idempotente solo si `seats` aún no fue migrado.)
do $$
declare ev record; tt record; v_venue uuid; v_map uuid; v_zone uuid;
  xmin numeric; ymin numeric; xmax numeric; ymax numeric;
begin
  for ev in select distinct event_id from public.seats loop
    insert into public.venues_v2 (org_id, name, city, region)
      select e.org_id, e.title || ' — Recinto', e.city, e.region from public.events e where e.id = ev.event_id
      returning id into v_venue;
    insert into public.venue_maps (venue_id, name, status, width_m, height_m)
      values (v_venue, 'Mapa migrado', 'published', 60, 40) returning id into v_map;
    insert into public.event_maps (event_id, map_id) values (ev.event_id, v_map) on conflict (event_id) do nothing;

    for tt in select distinct s.ticket_type_id as ttid, x.name, x.price_cents
              from public.seats s join public.ticket_types x on x.id = s.ticket_type_id
              where s.event_id = ev.event_id loop
      select min(pos_x), min(pos_y), max(pos_x), max(pos_y) into xmin, ymin, xmax, ymax
        from public.seats where event_id = ev.event_id and ticket_type_id = tt.ttid;
      insert into public.zones (map_id, name, kind, area, display_order)
        values (v_map, tt.name, 'seated', extensions.ST_MakeEnvelope(xmin-1, ymin-1, xmax+1, ymax+1, 0), 0)
        returning id into v_zone;
      insert into public.event_zone_pricing (event_id, zone_id, ticket_type_id, price_cents)
        values (ev.event_id, v_zone, tt.ttid, tt.price_cents);
      insert into public.rows (zone_id, label)
        select v_zone, s.row_label from public.seats s
        where s.event_id = ev.event_id and s.ticket_type_id = tt.ttid group by s.row_label;
      insert into public.venue_seats (map_id, zone_id, row_id, label, pos)
        select v_map, v_zone, r.id, s.seat_num::text, extensions.ST_SetSRID(extensions.ST_MakePoint(s.pos_x, s.pos_y), 0)
        from public.seats s join public.rows r on r.zone_id = v_zone and r.label = s.row_label
        where s.event_id = ev.event_id and s.ticket_type_id = tt.ttid;
      insert into public.event_seats (event_id, venue_seat_id, zone_id, status, order_id)
        select ev.event_id, vs.id, v_zone, s.status, s.order_id
        from public.seats s
        join public.rows r on r.zone_id = v_zone and r.label = s.row_label
        join public.venue_seats vs on vs.row_id = r.id and vs.label = s.seat_num::text
        where s.event_id = ev.event_id and s.ticket_type_id = tt.ttid;
    end loop;
  end loop;
end $$;
