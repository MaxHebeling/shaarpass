-- ============================================================================
-- Ticketera — Row Level Security
-- Patrón: shared DB + RLS por org_id. Lectura pública de lo publicado vía
-- funciones SECURITY DEFINER (no abrimos las policies). Escritura = solo miembros.
-- ============================================================================

-- Helper: ¿el usuario actual pertenece a esta org? SECURITY DEFINER evita
-- recursión de RLS al consultar org_members desde dentro de una policy.
create or replace function public.is_org_member(target_org uuid, min_roles text[] default array['owner','admin','staff','scanner'])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role = any(min_roles)
  );
$$;

-- Helper para mapear event_id -> org_id (usado por la policy de tickets más abajo).
create or replace function public.event_org(target_event uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$ select org_id from public.events where id = target_event; $$;

alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;
alter table public.venues         enable row level security;
alter table public.events         enable row level security;
alter table public.ticket_types   enable row level security;
alter table public.ticket_holds   enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.attendees      enable row level security;
alter table public.tickets        enable row level security;
alter table public.promo_codes    enable row level security;
alter table public.payouts        enable row level security;

-- ---------- ORGANIZATIONS ----------
create policy org_member_read on public.organizations
  for select using (public.is_org_member(id));
create policy org_admin_write on public.organizations
  for all using (public.is_org_member(id, array['owner','admin']))
  with check (public.is_org_member(id, array['owner','admin']));

-- ---------- ORG_MEMBERS ----------
create policy member_self_read on public.org_members
  for select using (user_id = auth.uid() or public.is_org_member(org_id, array['owner','admin']));
create policy member_admin_write on public.org_members
  for all using (public.is_org_member(org_id, array['owner','admin']))
  with check (public.is_org_member(org_id, array['owner','admin']));

-- ---------- VENUES ----------
create policy venue_org_all on public.venues
  for all using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id, array['owner','admin','staff']));

-- ---------- EVENTS ----------
-- Lectura pública SOLO de eventos publicados; los borradores solo miembros.
create policy event_public_read on public.events
  for select using (status = 'published' or public.is_org_member(org_id));
create policy event_org_write on public.events
  for all using (public.is_org_member(org_id, array['owner','admin','staff']))
  with check (public.is_org_member(org_id, array['owner','admin','staff']));

-- ---------- TICKET_TYPES ----------
create policy ticket_type_public_read on public.ticket_types
  for select using (
    exists (select 1 from public.events e
            where e.id = event_id and (e.status = 'published' or public.is_org_member(e.org_id)))
  );
create policy ticket_type_org_write on public.ticket_types
  for all using (
    exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.org_id, array['owner','admin','staff']))
  )
  with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.org_id, array['owner','admin','staff']))
  );

-- ---------- ORDERS ----------
-- El comprador ve sus órdenes; la org ve las de sus eventos.
-- La creación/confirmación va por funciones SECURITY DEFINER (service role en webhook).
create policy order_owner_read on public.orders
  for select using (buyer_user_id = auth.uid() or public.is_org_member(org_id));

create policy order_item_read on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and (o.buyer_user_id = auth.uid() or public.is_org_member(o.org_id)))
  );

create policy attendee_read on public.attendees
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and (o.buyer_user_id = auth.uid() or public.is_org_member(o.org_id)))
  );

-- ---------- TICKETS ----------
create policy ticket_read on public.tickets
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and (o.buyer_user_id = auth.uid() or public.is_org_member(o.org_id)))
  );
-- El check-in (update) lo hace personal con rol scanner+ de la org.
create policy ticket_checkin on public.tickets
  for update using (public.is_org_member(event_org(event_id), array['owner','admin','staff','scanner']))
  with check (public.is_org_member(event_org(event_id), array['owner','admin','staff','scanner']));

-- ---------- PROMO_CODES ----------
create policy promo_org_all on public.promo_codes
  for all using (
    exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.org_id, array['owner','admin','staff']))
  )
  with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.org_id, array['owner','admin','staff']))
  );

-- ---------- PAYOUTS ----------
create policy payout_org_read on public.payouts
  for select using (public.is_org_member(org_id, array['owner','admin']));
