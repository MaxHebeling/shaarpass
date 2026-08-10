create table if not exists public.campaign_emails (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  country text,
  ticket_type text,
  resend_id text,
  delivered boolean not null default false,
  opened boolean not null default false,
  clicked boolean not null default false,
  bounced boolean not null default false,
  complained boolean not null default false,
  unsubscribed boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists campaign_emails_uniq on public.campaign_emails(campaign_id, email);
create index if not exists campaign_emails_resend on public.campaign_emails(resend_id);

alter table public.campaign_emails enable row level security;
drop policy if exists campaign_emails_read on public.campaign_emails;
create policy campaign_emails_read on public.campaign_emails for select using (
  exists (select 1 from public.campaigns c join public.events e on e.id = c.event_id
          join public.org_members m on m.org_id = e.org_id
          where c.id = campaign_emails.campaign_id and m.user_id = auth.uid())
);

alter table public.campaigns add column if not exists delivered_count int not null default 0;
alter table public.campaigns add column if not exists opened_count int not null default 0;
alter table public.campaigns add column if not exists clicked_count int not null default 0;
alter table public.campaigns add column if not exists bounced_count int not null default 0;
alter table public.campaigns add column if not exists unsub_count int not null default 0;
