-- Fase 1 — RLS de las tablas de recinto/evento/servicios.
create or replace function public.map_org(p_map uuid)
returns uuid language sql security definer set search_path = public stable
as $$ select v.org_id from public.venue_maps m join public.venues_v2 v on v.id = m.venue_id where m.id = p_map $$;
grant execute on function public.map_org(uuid) to anon, authenticated, service_role;

alter table public.venues_v2 enable row level security;
alter table public.venue_maps enable row level security;
alter table public.zones enable row level security;
alter table public.rows enable row level security;
alter table public.venue_seats enable row level security;
alter table public.event_maps enable row level security;
alter table public.event_zone_pricing enable row level security;
alter table public.event_seats enable row level security;
alter table public.services enable row level security;
alter table public.order_services enable row level security;

create policy venue_org_all on public.venues_v2 for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id, array['owner','admin','staff']));

create policy map_read on public.venue_maps for select
  using (status='published' or public.is_org_member((select org_id from public.venues_v2 v where v.id = venue_id)));
create policy map_write on public.venue_maps for all
  using (public.is_org_member((select org_id from public.venues_v2 v where v.id = venue_id), array['owner','admin','staff']))
  with check (public.is_org_member((select org_id from public.venues_v2 v where v.id = venue_id), array['owner','admin','staff']));

create policy zone_read on public.zones for select using (true);
create policy zone_write on public.zones for all
  using (public.is_org_member(public.map_org(map_id), array['owner','admin','staff']))
  with check (public.is_org_member(public.map_org(map_id), array['owner','admin','staff']));
create policy row_read on public.rows for select using (true);
create policy row_write on public.rows for all
  using (public.is_org_member(public.map_org((select map_id from public.zones z where z.id = zone_id)), array['owner','admin','staff']))
  with check (public.is_org_member(public.map_org((select map_id from public.zones z where z.id = zone_id)), array['owner','admin','staff']));
create policy seat_read on public.venue_seats for select using (true);
create policy seat_write on public.venue_seats for all
  using (public.is_org_member(public.map_org(map_id), array['owner','admin','staff']))
  with check (public.is_org_member(public.map_org(map_id), array['owner','admin','staff']));

create policy emap_read on public.event_maps for select using (true);
create policy emap_write on public.event_maps for all
  using (public.is_org_member(public.event_org(event_id), array['owner','admin','staff']))
  with check (public.is_org_member(public.event_org(event_id), array['owner','admin','staff']));
create policy ezp_read on public.event_zone_pricing for select using (true);
create policy ezp_write on public.event_zone_pricing for all
  using (public.is_org_member(public.event_org(event_id), array['owner','admin','staff']))
  with check (public.is_org_member(public.event_org(event_id), array['owner','admin','staff']));
create policy eseat_read on public.event_seats for select using (true);

create policy service_read on public.services for select
  using (active = true or public.is_org_member(public.event_org(event_id)));
create policy service_write on public.services for all
  using (public.is_org_member(public.event_org(event_id), array['owner','admin','staff']))
  with check (public.is_org_member(public.event_org(event_id), array['owner','admin','staff']));

create policy oservice_read on public.order_services for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_user_id = auth.uid() or public.is_org_member(o.org_id))));
