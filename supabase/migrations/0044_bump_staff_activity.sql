create or replace function public.bump_staff_activity(p_staff uuid)
returns void language sql security definer set search_path to 'public' as $$
  update public.event_staff set scans_count = scans_count + 1, last_active_at = now() where id = p_staff;
$$;
grant execute on function public.bump_staff_activity(uuid) to anon, authenticated, service_role;
