-- Fase 1 — Estado de venta por evento + servicios/extras.
create table public.event_maps (
  event_id uuid primary key references public.events(id) on delete cascade,
  map_id uuid not null references public.venue_maps(id),
  created_at timestamptz not null default now()
);

create table public.event_zone_pricing (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  ticket_type_id uuid references public.ticket_types(id) on delete set null,
  price_cents int not null check (price_cents >= 0),
  unique (event_id, zone_id)
);

create table public.event_seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  venue_seat_id uuid not null references public.venue_seats(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  status text not null default 'available' check (status in ('available','held','sold')),
  hold_session text, hold_expires_at timestamptz,
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now(),
  unique (event_id, venue_seat_id)
);
create index event_seats_event_status_idx on public.event_seats(event_id, status);
create index event_seats_zone_idx on public.event_seats(zone_id);
create index event_seats_order_idx on public.event_seats(order_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  kind text not null default 'extra' check (kind in ('food','drink','parking','merch','vip','access','extra')),
  price_cents int not null check (price_cents >= 0),
  currency text not null,
  inventory int, sold int not null default 0,
  max_per_order int not null default 10,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (inventory is null or sold <= inventory)
);
create index services_event_idx on public.services(event_id);

create table public.order_services (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id uuid not null references public.services(id),
  quantity int not null check (quantity > 0),
  unit_price_cents int not null
);
create index order_services_order_idx on public.order_services(order_id);

-- (Migración de datos del modelo `seats` → venue_seats/event_seats: ver
--  supabase/migrations/0013b_migrate_seats_data.sql, corrida como data migration.)
