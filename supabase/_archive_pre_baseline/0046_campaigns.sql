create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  subject text not null,
  preheader text,
  from_name text,
  reply_to text,
  body_html text,
  segment jsonb not null default '{"type":"all"}',
  scheduled_at timestamptz,
  timezone text,
  status text not null default 'draft',
  recipients_count int not null default 0,
  sent_count int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists campaigns_event_idx on public.campaigns(event_id, created_at desc);
create index if not exists campaigns_due_idx on public.campaigns(status, scheduled_at);

alter table public.campaigns enable row level security;
drop policy if exists campaigns_org on public.campaigns;
create policy campaigns_org on public.campaigns for all
  using (exists (select 1 from public.events e join public.org_members m on m.org_id = e.org_id where e.id = campaigns.event_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.events e join public.org_members m on m.org_id = e.org_id where e.id = campaigns.event_id and m.user_id = auth.uid()));
