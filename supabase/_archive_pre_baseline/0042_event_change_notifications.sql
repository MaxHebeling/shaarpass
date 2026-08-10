-- Toggle por evento (activado por defecto).
alter table public.events add column if not exists notify_on_change boolean not null default true;

-- Log de auditoría de cambios que afectan la asistencia.
create table if not exists public.event_change_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  changes jsonb not null default '[]',
  recipients_count int not null default 0,
  channels text[] not null default '{email}',
  status text not null default 'queued'
);
create index if not exists event_change_log_event_idx on public.event_change_log(event_id, changed_at desc);

-- Cola de jobs de notificación (multicanal, escalable).
create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  log_id uuid references public.event_change_log(id) on delete set null,
  type text not null default 'event_change',
  payload jsonb not null,
  channels text[] not null default '{email}',
  status text not null default 'pending',
  recipients_count int not null default 0,
  sent_count int not null default 0,
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists notification_jobs_status_idx on public.notification_jobs(status, created_at);

alter table public.event_change_log enable row level security;
drop policy if exists event_change_log_read on public.event_change_log;
create policy event_change_log_read on public.event_change_log for select using (
  exists (select 1 from public.events e join public.org_members m on m.org_id = e.org_id
          where e.id = event_change_log.event_id and m.user_id = auth.uid())
);
alter table public.notification_jobs enable row level security;  -- sin policies: service role only
