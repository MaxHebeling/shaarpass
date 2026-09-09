-- Direct charges + OXXO (pagos asíncronos)
-- =========================================
-- Contexto: los cargos pasan a ser DIRECTOS sobre la cuenta Connect del organizador
-- (el dinero nunca toca el RFC de la plataforma). OXXO es efectivo asíncrono: la
-- ficha se emite al confirmar, pero el pago entra minutos/días después. Mientras
-- tanto la reserva de inventario debe SOBREVIVIR hasta el vencimiento de la ficha,
-- y liberarse si la ficha vence o el pago falla.

begin;

-- 1) Estado nuevo: 'awaiting_payment' = ficha/referencia emitida, esperando el pago.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status = any (array['pending','awaiting_payment','paid','failed','refunded','cancelled']));

-- 2) Metadatos del pago async (para /gracias, correos y reintentos).
alter table public.orders add column if not exists payment_method text;      -- 'card' | 'oxxo' | 'spei'
alter table public.orders add column if not exists voucher_url text;          -- liga a la ficha OXXO hospedada
alter table public.orders add column if not exists voucher_expires_at timestamptz;

-- 3) La ficha se emitió: marca la orden y EXTIENDE la reserva de inventario al
--    vencimiento de la ficha, para que el asiento/cupo siga apartado hasta que el
--    comprador pague en la tienda. Idempotente. Llamada por el webhook (service role).
create or replace function public.mark_order_awaiting_payment(
  p_order_id uuid,
  p_method text,
  p_voucher_url text,
  p_expires_at timestamptz
) returns void
  language plpgsql security definer
  set search_path to 'public', 'extensions'
as $$
declare v_status text;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then raise exception 'orden % no existe', p_order_id using errcode='no_data_found'; end if;
  -- Solo desde 'pending' o re-emisión de una ya en espera. Nunca pisa una pagada.
  if v_status not in ('pending','awaiting_payment') then return; end if;

  update public.orders
     set status = 'awaiting_payment',
         payment_method = p_method,
         voucher_url = coalesce(p_voucher_url, voucher_url),
         voucher_expires_at = p_expires_at
   where id = p_order_id;

  -- Extiende holds de GA (available_stock los cuenta por expires_at > now()).
  update public.ticket_holds
     set expires_at = greatest(expires_at, p_expires_at)
   where order_id = p_order_id;

  -- Extiende holds de asientos (ambos modelos). El cron no los toca porque tienen order_id.
  update public.event_seats
     set hold_expires_at = greatest(coalesce(hold_expires_at, p_expires_at), p_expires_at)
   where order_id = p_order_id and status = 'held';
  update public.seats
     set hold_expires_at = greatest(coalesce(hold_expires_at, p_expires_at), p_expires_at)
   where order_id = p_order_id and status = 'held';
end $$;

-- 4) La ficha venció o el pago falló: libera la reserva y marca la orden 'failed'.
--    Idempotente y SIN efecto si la orden ya está pagada/reembolsada. Service role.
create or replace function public.release_order_holds(p_order_id uuid)
  returns void
  language plpgsql security definer
  set search_path to 'public', 'extensions'
as $$
declare v_status text;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then return; end if;
  if v_status not in ('pending','awaiting_payment') then return; end if; -- no tocar pagadas

  -- GA: borrar holds libera stock (available_stock los cuenta).
  delete from public.ticket_holds where order_id = p_order_id;

  -- Asientos: regresar a disponible y soltar la orden (solo los que seguían en hold).
  update public.event_seats
     set status='available', hold_session=null, hold_expires_at=null, order_id=null
   where order_id = p_order_id and status = 'held';
  update public.seats
     set status='available', hold_session=null, hold_expires_at=null, order_id=null
   where order_id = p_order_id and status = 'held';

  update public.orders set status='failed' where id = p_order_id;
end $$;

-- 5) Estas RPC solo deben invocarse desde el servidor (service role), nunca anon.
--    Supabase concede EXECUTE por defecto a anon/authenticated en funciones de
--    public (además del grant a PUBLIC), así que hay que revocarles a los tres.
revoke all on function public.mark_order_awaiting_payment(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.release_order_holds(uuid) from public, anon, authenticated;
grant execute on function public.mark_order_awaiting_payment(uuid, text, text, timestamptz) to service_role;
grant execute on function public.release_order_holds(uuid) to service_role;

commit;
