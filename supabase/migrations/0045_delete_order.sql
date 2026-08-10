-- Elimina una orden y libera su inventario/asientos. Authz: miembro de la org del evento.
create or replace function public.delete_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_event uuid;
begin
  select event_id into v_event from public.orders where id = p_order_id;
  if v_event is null then return; end if;
  if not exists (
    select 1 from public.events e join public.org_members m on m.org_id = e.org_id
    where e.id = v_event and m.user_id = auth.uid()
  ) then
    raise exception 'no autorizado';
  end if;

  update public.ticket_types tt
    set quantity_sold = greatest(0, tt.quantity_sold - t.cnt)
    from (
      select ticket_type_id, count(*)::int cnt from public.tickets
      where order_id = p_order_id and status in ('valid','checked_in') and ticket_type_id is not null
      group by ticket_type_id
    ) t
    where tt.id = t.ticket_type_id;

  update public.services s
    set sold = greatest(0, s.sold - os.qty)
    from (select service_id, sum(quantity)::int qty from public.order_services where order_id = p_order_id group by service_id) os
    where s.id = os.service_id;

  update public.seats set order_id = null, status = 'available', hold_session = null, hold_expires_at = null where order_id = p_order_id;
  update public.event_seats set order_id = null, status = 'available', hold_session = null, hold_expires_at = null where order_id = p_order_id;

  delete from public.checkin_log where ticket_id in (select id from public.tickets where order_id = p_order_id);
  delete from public.tickets where order_id = p_order_id;
  delete from public.order_services where order_id = p_order_id;
  delete from public.order_items where order_id = p_order_id;
  delete from public.ticket_holds where order_id = p_order_id;
  delete from public.orders where id = p_order_id;
end; $$;
revoke all on function public.delete_order(uuid) from anon;
grant execute on function public.delete_order(uuid) to authenticated;
