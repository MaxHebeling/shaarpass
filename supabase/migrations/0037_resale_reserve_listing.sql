-- TM-2b hardening: reserva atómica del listing para evitar doble venta en reventa.
-- reserve_listing(p_listing) -> boolean: active→reserved con FOR UPDATE (false si no estaba active).
-- release_listing(p_listing): reserved→active (pago fallido/cancelado).
-- buy_listing recreada para aceptar status 'active' O 'reserved' (el checkout reserva antes de pagar).
-- Solo service_role. Cuerpos completos aplicados en Supabase (migración 0037); ver también 0038.
create or replace function public.reserve_listing(p_listing uuid)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_status text;
begin
  select status into v_status from public.listings where id = p_listing for update;
  if v_status is distinct from 'active' then return false; end if;
  update public.listings set status = 'reserved' where id = p_listing;
  return true;
end $$;

create or replace function public.release_listing(p_listing uuid)
returns void
language sql security definer set search_path = public, extensions as $$
  update public.listings set status = 'active' where id = p_listing and status = 'reserved';
$$;
-- buy_listing: ver cuerpo completo en 0038-adjacent (acepta 'active'/'reserved').
revoke all on function public.reserve_listing(uuid) from public, anon, authenticated;
revoke all on function public.release_listing(uuid) from public, anon, authenticated;
grant execute on function public.reserve_listing(uuid) to service_role;
grant execute on function public.release_listing(uuid) to service_role;
