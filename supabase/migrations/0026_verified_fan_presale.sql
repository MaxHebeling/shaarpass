-- TM-4: Verified Fan / presale con lotería + códigos.
alter table public.events add column if not exists presale_enabled boolean not null default false;
alter table public.events add column if not exists presale_ends_at timestamptz;

create table public.presale_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null,
  selected boolean not null default false,
  code text, used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);
create index presale_event_idx on public.presale_registrations(event_id);
alter table public.presale_registrations enable row level security;
create policy presale_org_read on public.presale_registrations for select
  using (public.is_org_member(public.event_org(event_id)));

-- register_presale (público), run_presale_lottery (org; selecciona N al azar + código
-- único por persona), validate_presale_code (gate del checkout), consume_presale_code.
-- Cuerpo completo aplicado en el proyecto Supabase (migración 0026).
