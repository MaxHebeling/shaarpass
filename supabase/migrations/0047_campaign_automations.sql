alter table public.campaigns add column if not exists kind text not null default 'manual';
alter table public.campaigns add column if not exists automation_key text;
create unique index if not exists campaigns_auto_uniq on public.campaigns(event_id, automation_key) where automation_key is not null;
