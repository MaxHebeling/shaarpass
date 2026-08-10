-- TM-6: límite de boletos por comprador + rate limiting (anti-bot / BOTS Act).
alter table public.events add column if not exists max_tickets_per_buyer int;  -- null = sin límite

create or replace function public.buyer_ticket_count(p_event uuid, p_email text)
returns int language sql security definer set search_path = public, extensions stable
as $$
  select coalesce(sum(oi.quantity), 0)::int
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.event_id = p_event and o.buyer_email = p_email and o.status = 'paid';
$$;
grant execute on function public.buyer_ticket_count(uuid, text) to anon, authenticated, service_role;

create table public.rate_hits (key text primary key, count int not null default 0, reset_at timestamptz not null);
alter table public.rate_hits enable row level security;

create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public, extensions
as $$
declare v_count int;
begin
  insert into public.rate_hits (key, count, reset_at)
  values (p_key, 1, now() + (p_window_seconds || ' seconds')::interval)
  on conflict (key) do update set
    count = case when public.rate_hits.reset_at < now() then 1 else public.rate_hits.count + 1 end,
    reset_at = case when public.rate_hits.reset_at < now() then now() + (p_window_seconds || ' seconds')::interval else public.rate_hits.reset_at end
  returning count into v_count;
  return v_count <= p_max;
end $$;
revoke execute on function public.hit_rate_limit(text,int,int) from public, anon;
grant execute on function public.hit_rate_limit(text,int,int) to anon, authenticated, service_role;

create or replace function public.cleanup_rate_hits()
returns int language sql security definer set search_path = public, extensions
as $$ with d as (delete from public.rate_hits where reset_at < now() - interval '1 hour' returning 1) select count(*)::int from d; $$;
grant execute on function public.cleanup_rate_hits() to service_role, postgres;
select cron.schedule('cleanup-rate-hits', '*/5 * * * *', $$ select public.cleanup_rate_hits(); $$);
