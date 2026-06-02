-- Gap #5 — Lista de espera + campañas de email.
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid references public.ticket_types(id) on delete cascade,
  email text not null,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index waitlist_event_idx on public.waitlist(event_id, created_at);

alter table public.waitlist enable row level security;
create policy waitlist_public_insert on public.waitlist for insert
  with check (exists (select 1 from public.events e where e.id = event_id and e.status = 'published'));
create policy waitlist_org_read on public.waitlist for select
  using (public.is_org_member(public.event_org(event_id)));
create policy waitlist_org_update on public.waitlist for update
  using (public.is_org_member(public.event_org(event_id), array['owner','admin','staff']));

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  subject text not null,
  body text not null,
  recipients int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.email_campaigns enable row level security;
create policy campaign_org_all on public.email_campaigns for all
  using (public.is_org_member(public.event_org(event_id), array['owner','admin','staff']))
  with check (public.is_org_member(public.event_org(event_id), array['owner','admin','staff']));
