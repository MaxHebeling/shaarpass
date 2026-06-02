-- Fase 1 — Lock atómico de asientos por evento + vista de disponibilidad.
create or replace function public.hold_event_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes int default 10)
returns void language plpgsql security definer set search_path = public, extensions
as $$
declare s record;
begin
  for s in select id, status, hold_expires_at from public.event_seats where id = any(p_seat_ids) for update loop
    if s.status = 'sold' or (s.status = 'held' and s.hold_expires_at > now()) then
      raise exception 'asiento no disponible' using errcode='check_violation';
    end if;
  end loop;
  update public.event_seats
    set status='held', hold_session=p_session, hold_expires_at = now() + (p_ttl_minutes||' minutes')::interval
    where id = any(p_seat_ids);
end $$;

create or replace function public.release_expired_event_seats()
returns int language sql security definer set search_path = public, extensions
as $$
  with upd as (
    update public.event_seats set status='available', hold_session=null, hold_expires_at=null
    where status='held' and hold_expires_at <= now() and order_id is null returning 1
  ) select count(*)::int from upd;
$$;

revoke execute on function public.release_expired_event_seats() from public, anon;
grant execute on function public.hold_event_seats(uuid[],text,int) to anon, authenticated, service_role;
grant execute on function public.release_expired_event_seats() to service_role, postgres;

select cron.schedule('release-expired-event-seats', '* * * * *', $$ select public.release_expired_event_seats(); $$);

-- Disponibilidad por zona (security_invoker para respetar RLS del que consulta).
create or replace view public.zone_availability with (security_invoker = true) as
  select event_id, zone_id,
    count(*) filter (where status='available') as available,
    count(*) filter (where status='held') as held,
    count(*) filter (where status='sold') as sold,
    count(*) as total
  from public.event_seats group by event_id, zone_id;
