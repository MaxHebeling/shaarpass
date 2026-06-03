-- ============================================================================
-- SNAPSHOT de funciones SQL críticas (dinero / inventario) — versionado en repo.
-- Fuente de verdad sigue siendo el proyecto Supabase; este archivo permite
-- auditar y re-aplicar la lógica si la BD se restaura o diverge.
-- Generado desde pg_get_functiondef el 2026-06-03. (buy_listing/reserve_listing/
-- release_listing viven en 0037; las de cola/presale/rate-limit en 0022-0026.)
-- ============================================================================

-- ===== confirm_order_paid: emite boletos tras pago confirmado (idempotente, anti-sobreventa) =====
CREATE OR REPLACE FUNCTION public.confirm_order_paid(p_order_id uuid, p_payment_intent_id text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v_status text; v_promo uuid; v_event uuid; v_seated boolean; v_cnt int; v_tt uuid; item record; z record; srv record; i int;
begin
  select status, promo_code_id, event_id into v_status, v_promo, v_event from public.orders where id=p_order_id for update;
  if not found then raise exception 'orden % no existe', p_order_id using errcode='no_data_found'; end if;
  if v_status = 'paid' then return; end if;

  for item in select ticket_type_id, quantity from public.order_items where order_id=p_order_id loop
    select is_seated into v_seated from public.ticket_types where id=item.ticket_type_id;
    if v_seated then
      update public.seats set status='sold' where order_id=p_order_id and ticket_type_id=item.ticket_type_id and status='held';
      get diagnostics v_cnt = row_count;
      if v_cnt > 0 then
        update public.ticket_types set quantity_sold = quantity_sold + v_cnt where id=item.ticket_type_id;
        insert into public.tickets (order_id, ticket_type_id, event_id, seat_id, qr_token)
          select p_order_id, item.ticket_type_id, v_event, s.id, encode(extensions.gen_random_bytes(24),'hex')
          from public.seats s where s.order_id=p_order_id and s.ticket_type_id=item.ticket_type_id;
      end if;
    else
      update public.ticket_types set quantity_sold = quantity_sold + item.quantity
        where id=item.ticket_type_id and quantity_sold + item.quantity <= quantity_total;
      get diagnostics v_cnt = row_count;
      if v_cnt = 0 then raise exception 'overselling evitado en %', item.ticket_type_id using errcode='check_violation'; end if;
      for i in 1..item.quantity loop
        insert into public.tickets (order_id, ticket_type_id, event_id, qr_token)
        values (p_order_id, item.ticket_type_id, v_event, encode(extensions.gen_random_bytes(24),'hex'));
      end loop;
    end if;
  end loop;

  for z in select zone_id, count(*) c from public.event_seats where order_id=p_order_id and status='held' group by zone_id loop
    select ticket_type_id into v_tt from public.event_zone_pricing where event_id=v_event and zone_id=z.zone_id;
    update public.event_seats set status='sold' where order_id=p_order_id and zone_id=z.zone_id and status='held';
    if v_tt is not null then
      update public.ticket_types set quantity_sold = quantity_sold + z.c where id=v_tt;
      insert into public.tickets (order_id, ticket_type_id, event_id, seat_id, qr_token)
        select p_order_id, v_tt, v_event, es.venue_seat_id, encode(extensions.gen_random_bytes(24),'hex')
        from public.event_seats es where es.order_id=p_order_id and es.zone_id=z.zone_id;
    end if;
  end loop;

  for srv in select service_id, quantity from public.order_services where order_id=p_order_id loop
    update public.services set sold = sold + srv.quantity
      where id = srv.service_id and (inventory is null or sold + srv.quantity <= inventory);
  end loop;

  delete from public.ticket_holds where order_id=p_order_id;
  if v_promo is not null then update public.promo_codes set times_redeemed = times_redeemed + 1 where id=v_promo; end if;
  update public.orders set status='paid', paid_at=now(),
    stripe_payment_intent_id=coalesce(stripe_payment_intent_id, p_payment_intent_id) where id=p_order_id;
end $function$;

-- ===== refund_order: reembolsa y devuelve inventario (org-gated) =====
CREATE OR REPLACE FUNCTION public.refund_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v_status text; v_org uuid; v_promo uuid; v_event uuid; v_seated boolean; v_cnt int; v_tt uuid; item record; z record; srv record;
begin
  select status, org_id, promo_code_id, event_id into v_status, v_org, v_promo, v_event from public.orders where id=p_order_id for update;
  if not found then raise exception 'orden % no existe', p_order_id using errcode='no_data_found'; end if;
  if not public.is_org_member(v_org, array['owner','admin']) then raise exception 'no autorizado' using errcode='insufficient_privilege'; end if;
  if v_status = 'refunded' then return; end if;

  if v_status = 'paid' then
    for item in select ticket_type_id, quantity from public.order_items where order_id=p_order_id loop
      select is_seated into v_seated from public.ticket_types where id=item.ticket_type_id;
      if v_seated then
        select count(*) into v_cnt from public.seats where order_id=p_order_id and ticket_type_id=item.ticket_type_id;
        update public.seats set status='available', hold_session=null, hold_expires_at=null, order_id=null
          where order_id=p_order_id and ticket_type_id=item.ticket_type_id;
        update public.ticket_types set quantity_sold = greatest(0, quantity_sold - v_cnt) where id=item.ticket_type_id;
      else
        update public.ticket_types set quantity_sold = greatest(0, quantity_sold - item.quantity) where id=item.ticket_type_id;
      end if;
    end loop;
    for z in select zone_id, count(*) c from public.event_seats where order_id=p_order_id group by zone_id loop
      select ticket_type_id into v_tt from public.event_zone_pricing where event_id=v_event and zone_id=z.zone_id;
      if v_tt is not null then update public.ticket_types set quantity_sold = greatest(0, quantity_sold - z.c) where id=v_tt; end if;
    end loop;
    update public.event_seats set status='available', hold_session=null, hold_expires_at=null, order_id=null where order_id=p_order_id;
    for srv in select service_id, quantity from public.order_services where order_id=p_order_id loop
      update public.services set sold = greatest(0, sold - srv.quantity) where id = srv.service_id;
    end loop;
    update public.tickets set status='refunded' where order_id=p_order_id and status in ('valid','checked_in');
    if v_promo is not null then update public.promo_codes set times_redeemed = greatest(0, times_redeemed-1) where id=v_promo; end if;
    update public.orders set status='refunded' where id=p_order_id;
  else
    update public.orders set status='cancelled' where id=p_order_id;
  end if;
end $function$;

-- ===== cancel_event: cancela + reembolsa todas las órdenes pagadas (org-gated) =====
CREATE OR REPLACE FUNCTION public.cancel_event(p_event uuid)
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v_org uuid; ord record; n int := 0;
begin
  select org_id into v_org from public.events where id = p_event;
  if v_org is null then raise exception 'evento no existe' using errcode = 'no_data_found'; end if;
  if not public.is_org_member(v_org, array['owner','admin']) then
    raise exception 'no autorizado' using errcode = 'insufficient_privilege';
  end if;
  update public.events set status = 'cancelled' where id = p_event;
  for ord in select id from public.orders where event_id = p_event and status = 'paid' loop
    perform public.refund_order(ord.id);
    n := n + 1;
  end loop;
  return n;
end $function$;

-- ===== list_ticket: pone un boleto en reventa, topado al precio original =====
CREATE OR REPLACE FUNCTION public.list_ticket(p_token text, p_price_cents integer)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v_ticket uuid; v_event uuid; v_face int; v_from text; v_listing uuid;
begin
  select t.id, t.event_id into v_ticket, v_event from public.tickets t where t.qr_token = p_token and t.status = 'valid';
  if v_ticket is null then raise exception 'boleto no válido' using errcode='no_data_found'; end if;
  select oi.unit_price_cents into v_face from public.tickets t
    join public.order_items oi on oi.order_id = t.order_id and oi.ticket_type_id = t.ticket_type_id
    where t.id = v_ticket limit 1;
  if v_face is null then v_face := 0; end if;
  if p_price_cents > v_face then
    raise exception 'la reventa no puede superar el precio original (%.2f)', v_face/100.0 using errcode='check_violation';
  end if;
  select coalesce(a.email, o.buyer_email) into v_from
    from public.tickets t
    left join public.attendees a on a.id = t.attendee_id
    join public.orders o on o.id = t.order_id
    where t.id = v_ticket;
  insert into public.listings (ticket_id, event_id, seller_email, price_cents) values (v_ticket, v_event, v_from, p_price_cents) returning id into v_listing;
  return v_listing;
end $function$;

-- ===== transfer_ticket: reasigna boleto (rota QR) =====
CREATE OR REPLACE FUNCTION public.transfer_ticket(p_token text, p_to_email text, p_kind text DEFAULT 'transfer'::text)
 RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v_ticket uuid; v_att uuid; v_from text; v_new_token text; v_new_secret text;
begin
  select t.id, t.attendee_id, a.email into v_ticket, v_att, v_from
  from public.tickets t left join public.attendees a on a.id = t.attendee_id
  where t.qr_token = p_token;
  if v_ticket is null then raise exception 'boleto no encontrado' using errcode='no_data_found'; end if;
  v_new_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_new_secret := encode(extensions.gen_random_bytes(20), 'hex');
  update public.tickets set qr_token = v_new_token, totp_secret = v_new_secret where id = v_ticket;
  if v_att is not null then update public.attendees set email = p_to_email where id = v_att;
  else
    insert into public.attendees (order_id, email) select order_id, p_to_email from public.tickets where id = v_ticket returning id into v_att;
    update public.tickets set attendee_id = v_att where id = v_ticket;
  end if;
  insert into public.ticket_transfers (ticket_id, from_email, to_email, kind) values (v_ticket, v_from, p_to_email, p_kind);
  return v_new_token;
end $function$;

-- ===== reserve_season_pass / confirm_season_pass / release_season_pass (abonos) =====
CREATE OR REPLACE FUNCTION public.reserve_season_pass(p_season uuid)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare s record; se record;
begin
  select * into s from public.seasons where id = p_season for update;
  if s is null or s.status <> 'published' then return false; end if;
  if s.quantity_sold + 1 > s.quantity_total then return false; end if;
  for se in select event_id, ticket_type_id from public.season_events where season_id = p_season loop
    perform 1 from public.ticket_types tt where tt.id = se.ticket_type_id
      and tt.quantity_sold + 1 <= tt.quantity_total for update;
    if not found then return false; end if;
  end loop;
  update public.seasons set quantity_sold = quantity_sold + 1 where id = p_season;
  update public.ticket_types tt set quantity_sold = quantity_sold + 1
    where tt.id in (select ticket_type_id from public.season_events where season_id = p_season);
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.confirm_season_pass(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare o record; se record;
begin
  select * into o from public.orders where id = p_order for update;
  if o is null or o.season_id is null then raise exception 'orden de abono inválida'; end if;
  if o.status = 'paid' then return; end if;
  for se in select event_id, ticket_type_id from public.season_events where season_id = o.season_id loop
    insert into public.tickets (order_id, ticket_type_id, event_id, qr_token, status)
    values (p_order, se.ticket_type_id, se.event_id, encode(gen_random_bytes(16), 'hex'), 'valid');
  end loop;
  update public.orders set status = 'paid', paid_at = now() where id = p_order;
end $function$;

CREATE OR REPLACE FUNCTION public.release_season_pass(p_season uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
begin
  update public.seasons set quantity_sold = greatest(0, quantity_sold - 1) where id = p_season;
  update public.ticket_types tt set quantity_sold = greatest(0, quantity_sold - 1)
    where tt.id in (select ticket_type_id from public.season_events where season_id = p_season);
end $function$;
