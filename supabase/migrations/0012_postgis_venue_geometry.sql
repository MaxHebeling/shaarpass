-- Fase 1 — Geometría de recintos (PostGIS). Tablas reusables entre eventos.
create extension if not exists postgis with schema extensions;

create table public.venues_v2 (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, address text, city text, region text, country text,
  created_at timestamptz not null default now()
);

create table public.venue_maps (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues_v2(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','published')),
  width_m numeric not null default 100,
  height_m numeric not null default 100,
  background_url text,
  scale_px_per_m numeric,
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index venue_maps_venue_idx on public.venue_maps(venue_id);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.venue_maps(id) on delete cascade,
  name text not null,
  kind text not null default 'seated' check (kind in ('seated','ga','table','standing')),
  area extensions.geometry(Polygon, 0),
  color text default '#7c3aed',
  ga_capacity int,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index zones_map_idx on public.zones(map_id);
create index zones_area_gix on public.zones using gist(area);

create table public.rows (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  label text not null,
  curve jsonb,
  display_order int not null default 0
);
create index rows_zone_idx on public.rows(zone_id);

create table public.venue_seats (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.venue_maps(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  row_id uuid references public.rows(id) on delete cascade,
  label text not null,
  pos extensions.geometry(Point, 0) not null,
  rotation numeric default 0,
  created_at timestamptz not null default now()
);
create index venue_seats_map_idx on public.venue_seats(map_id);
create index venue_seats_zone_idx on public.venue_seats(zone_id);
create index venue_seats_pos_gix on public.venue_seats using gist(pos);
