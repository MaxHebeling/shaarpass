-- ============================================================
-- 0009 — Horario por día · Fases de precio (preventa/venta) · Acceso por día
-- ============================================================
-- Amplía eventos y boletos:
--  1) event_days: un evento puede durar varios días (fecha + inicio + fin).
--     events.starts_at/ends_at se mantienen como el PRIMER inicio y el ÚLTIMO fin
--     (trigger) para no romper listados/orden/filtros existentes.
--  2) ticket_price_phases: preventa y venta por tipo de boleto (inventario compartido).
--  3) ticket_checkins: acceso por día (un ingreso por boleto y por día).
-- Migra datos existentes sin romper nada (1 día por evento; 1 fase 'sale' por boleto).

-- ============ 1) DÍAS DEL EVENTO ============
create table if not exists public.event_days (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  constraint event_days_end_after_start check (ends_at > starts_at),
  constraint event_days_unique_date unique (event_id, day_date)
);
create index if not exists event_days_event_start_idx on public.event_days (event_id, starts_at);
alter table public.event_days enable row level security;

create policy event_days_public_read on public.event_days for select using (
  exists (select 1 from public.events e
          where e.id = event_days.event_id
            and (e.status = 'published' or public.is_org_member(e.org_id))));
create policy event_days_org_write on public.event_days using (
  exists (select 1 from public.events e
          where e.id = event_days.event_id
            and public.is_org_member(e.org_id, array['owner','admin','staff']))
) with check (
  exists (select 1 from public.events e
          where e.id = event_days.event_id
            and public.is_org_member(e.org_id, array['owner','admin','staff'])));
grant all on table public.event_days to anon, authenticated, service_role;

-- Mantener events.starts_at = MIN(día) y events.ends_at = MAX(día).
create or replace function public.sync_event_bounds() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare v_event uuid; v_min timestamptz; v_max timestamptz;
begin
  v_event := coalesce(new.event_id, old.event_id);
  select min(starts_at), max(ends_at) into v_min, v_max
    from public.event_days where event_id = v_event;
  if v_min is not null then
    update public.events set starts_at = v_min, ends_at = v_max
      where id = v_event and (starts_at is distinct from v_min or ends_at is distinct from v_max);
  end if;
  return null;
end; $$;

drop trigger if exists trg_sync_event_bounds on public.event_days;
create trigger trg_sync_event_bounds
  after insert or update or delete on public.event_days
  for each row execute function public.sync_event_bounds();

-- ============ 2) FASES DE PRECIO (preventa / venta) ============
create table if not exists public.ticket_price_phases (
  id uuid primary key default gen_random_uuid(),
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  kind text not null check (kind in ('presale','sale')),
  price_cents integer not null check (price_cents >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint phase_end_after_start check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists price_phase_type_idx on public.ticket_price_phases (ticket_type_id);
alter table public.ticket_price_phases enable row level security;

create policy phase_public_read on public.ticket_price_phases for select using (
  exists (select 1 from public.ticket_types tt join public.events e on e.id = tt.event_id
          where tt.id = ticket_price_phases.ticket_type_id
            and (e.status = 'published' or public.is_org_member(e.org_id))));
create policy phase_org_write on public.ticket_price_phases using (
  exists (select 1 from public.ticket_types tt join public.events e on e.id = tt.event_id
          where tt.id = ticket_price_phases.ticket_type_id
            and public.is_org_member(e.org_id, array['owner','admin','staff'])))
  with check (
  exists (select 1 from public.ticket_types tt join public.events e on e.id = tt.event_id
          where tt.id = ticket_price_phases.ticket_type_id
            and public.is_org_member(e.org_id, array['owner','admin','staff'])));
grant all on table public.ticket_price_phases to anon, authenticated, service_role;

-- Auditoría: precio y fase aplicados en cada línea de orden.
alter table public.order_items add column if not exists price_phase_id uuid references public.ticket_price_phases(id);
alter table public.order_items add column if not exists phase_kind text;

-- ============ 3) ACCESO POR DÍA ============
create table if not exists public.ticket_checkins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  event_day_id uuid not null references public.event_days(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid,
  checked_in_by_staff uuid,
  gate text,
  constraint ticket_checkins_unique unique (ticket_id, event_day_id)
);
create index if not exists ticket_checkins_day_idx on public.ticket_checkins (event_day_id);
create index if not exists ticket_checkins_event_idx on public.ticket_checkins (event_id);
alter table public.ticket_checkins enable row level security;

create policy ticket_checkin_org on public.ticket_checkins using (
  public.is_org_member(public.event_org(event_id), array['owner','admin','staff','scanner']))
  with check (
  public.is_org_member(public.event_org(event_id), array['owner','admin','staff','scanner']));
grant all on table public.ticket_checkins to anon, authenticated, service_role;

-- ============ 4) MIGRACIÓN DE DATOS ============
-- Un día por evento existente (a partir de sus start/end actuales, fecha en su zona).
insert into public.event_days (event_id, day_date, starts_at, ends_at, sort)
select e.id, (e.starts_at at time zone e.timezone)::date, e.starts_at, e.ends_at, 0
from public.events e
where not exists (select 1 from public.event_days d where d.event_id = e.id);

-- Una fase 'sale' por tipo de boleto existente, con su precio y fechas actuales.
insert into public.ticket_price_phases (ticket_type_id, kind, price_cents, starts_at, ends_at)
select tt.id, 'sale', tt.price_cents, tt.sales_start, tt.sales_end
from public.ticket_types tt
where not exists (select 1 from public.ticket_price_phases p where p.ticket_type_id = tt.id);

-- Ingresos ya registrados (status checked_in) → fila de acceso en el día único del evento.
insert into public.ticket_checkins (ticket_id, event_day_id, event_id, checked_in_at, checked_in_by)
select t.id, d.id, t.event_id, coalesce(t.checked_in_at, now()), t.checked_in_by
from public.tickets t
join public.event_days d on d.event_id = t.event_id
where t.status = 'checked_in'
on conflict (ticket_id, event_day_id) do nothing;
