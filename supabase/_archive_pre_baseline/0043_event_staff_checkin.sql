-- Personal de check-in por evento (enlaces seguros, sin compartir credenciales).
create table if not exists public.event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  gate text,
  role text not null default 'checkin',
  token text not null unique,
  expires_at timestamptz,
  revoked boolean not null default false,
  scans_count int not null default 0,
  last_active_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists event_staff_event_idx on public.event_staff(event_id);

alter table public.tickets add column if not exists checked_in_by_staff uuid;
alter table public.tickets add column if not exists checked_in_gate text;

create table if not exists public.checkin_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  staff_id uuid references public.event_staff(id) on delete set null,
  gate text,
  at timestamptz not null default now()
);
create index if not exists checkin_log_event_idx on public.checkin_log(event_id, at desc);

create or replace function public.staff_session(p_token text)
returns table(staff_id uuid, event_id uuid, staff_name text, gate text, role text, revoked boolean, expired boolean,
  event_title text, cover_image text, starts_at timestamptz, ends_at timestamptz, timezone text, city text, region text, is_online boolean, safetix_enabled boolean)
language sql security definer set search_path to 'public' as $$
  select s.id, s.event_id, s.name, s.gate, s.role, s.revoked,
    (s.expires_at is not null and s.expires_at < now()) as expired,
    e.title, e.cover_image, e.starts_at, e.ends_at, e.timezone, e.city, e.region, e.is_online, e.safetix_enabled
  from public.event_staff s join public.events e on e.id = s.event_id
  where s.token = p_token limit 1;
$$;
grant execute on function public.staff_session(text) to anon, authenticated;

alter table public.event_staff enable row level security;
drop policy if exists event_staff_org on public.event_staff;
create policy event_staff_org on public.event_staff for all
  using (exists (select 1 from public.events e join public.org_members m on m.org_id = e.org_id where e.id = event_staff.event_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.events e join public.org_members m on m.org_id = e.org_id where e.id = event_staff.event_id and m.user_id = auth.uid()));

alter table public.checkin_log enable row level security;
drop policy if exists checkin_log_read on public.checkin_log;
create policy checkin_log_read on public.checkin_log for select
  using (exists (select 1 from public.events e join public.org_members m on m.org_id = e.org_id where e.id = checkin_log.event_id and m.user_id = auth.uid()));
