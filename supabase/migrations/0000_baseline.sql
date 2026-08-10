-- ============================================================================
-- 0000_baseline — Esquema completo de producción (snapshot fiel vía pg_dump).
-- Reemplaza las migraciones fragmentadas 0001-0052 (archivadas en _archive/).
-- Reproduce prod desde cero: extensiones + schema public (tablas/funciones/RLS/
-- grants) + buckets de Storage + cron. Generado 2026-08-10.
-- ============================================================================
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron;

--
-- PostgreSQL database dump
--

\restrict 8khKozexFndahtTdQx9iucwcN2hXZyEhURdaQDgWCPNq6H0NeIltrOMvOa6jyKL

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: admit_all_queues(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admit_all_queues() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare ev record; v_cur int; v_toadmit int;
begin
  for ev in select id, queue_wave_size, queue_admit_minutes, queue_drawn
            from public.events where queue_enabled and onsale_at is not null and onsale_at <= now() loop
    if not ev.queue_drawn then
      update public.queue_sessions q set position = d.rn
      from (select id, row_number() over (order by random()) as rn
            from public.queue_sessions where event_id = ev.id and status='waiting' and position is null) d
      where q.id = d.id;
      update public.events set queue_drawn = true where id = ev.id;
    end if;
    update public.queue_sessions set status='expired'
      where event_id = ev.id and status='admitted' and admit_expires_at < now();
    select count(*) into v_cur from public.queue_sessions where event_id = ev.id and status='admitted';
    v_toadmit := greatest(0, ev.queue_wave_size - v_cur);
    if v_toadmit > 0 then
      update public.queue_sessions set status='admitted', admitted_at=now(),
        admit_expires_at = now() + (ev.queue_admit_minutes || ' minutes')::interval
      where id in (select id from public.queue_sessions
                   where event_id = ev.id and status='waiting' and position is not null
                   order by position limit v_toadmit);
    end if;
  end loop;
end $$;


--
-- Name: attach_map_to_event(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attach_map_to_event(p_event uuid, p_map uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_curr text; z record; v_tt uuid; v_cnt int;
begin
  if not public.is_org_member(public.event_org(p_event), array['owner','admin','staff']) then
    raise exception 'no autorizado' using errcode='insufficient_privilege';
  end if;
  select currency into v_curr from public.events where id = p_event;

  insert into public.event_maps (event_id, map_id) values (p_event, p_map)
    on conflict (event_id) do update set map_id = excluded.map_id;

  for z in select id, name, kind from public.zones where map_id = p_map loop
    select count(*) into v_cnt from public.venue_seats where zone_id = z.id;
    insert into public.ticket_types (event_id, name, price_cents, currency, quantity_total, is_seated)
      values (p_event, z.name, 0, v_curr, v_cnt, z.kind = 'seated')
      returning id into v_tt;
    insert into public.event_zone_pricing (event_id, zone_id, ticket_type_id, price_cents)
      values (p_event, z.id, v_tt, 0) on conflict (event_id, zone_id) do nothing;
    insert into public.event_seats (event_id, venue_seat_id, zone_id, status)
      select p_event, vs.id, vs.zone_id, 'available' from public.venue_seats vs where vs.zone_id = z.id
      on conflict (event_id, venue_seat_id) do nothing;
  end loop;
end $$;


--
-- Name: available_stock(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.available_stock(p_ticket_type uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select tt.quantity_total
       - tt.quantity_sold
       - coalesce((select sum(h.quantity) from public.ticket_holds h
                   where h.ticket_type_id = tt.id and h.expires_at > now()), 0)
  from public.ticket_types tt
  where tt.id = p_ticket_type;
$$;


--
-- Name: bump_campaign_metric(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_campaign_metric(p_campaign uuid, p_field text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_field = 'delivered' then update public.campaigns set delivered_count = delivered_count + 1 where id = p_campaign;
  elsif p_field = 'opened' then update public.campaigns set opened_count = opened_count + 1 where id = p_campaign;
  elsif p_field = 'clicked' then update public.campaigns set clicked_count = clicked_count + 1 where id = p_campaign;
  elsif p_field = 'bounced' then update public.campaigns set bounced_count = bounced_count + 1 where id = p_campaign;
  elsif p_field = 'unsub' then update public.campaigns set unsub_count = unsub_count + 1 where id = p_campaign;
  end if;
end; $$;


--
-- Name: bump_staff_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_staff_activity(p_staff uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.event_staff set scans_count = scans_count + 1, last_active_at = now() where id = p_staff;
$$;


--
-- Name: buy_listing(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buy_listing(p_listing uuid, p_buyer_email text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_status text; v_ticket uuid; v_price int; v_seller text; v_att uuid; v_newtok text; v_newsec text;
begin
  select status, ticket_id, price_cents, seller_email into v_status, v_ticket, v_price, v_seller
  from public.listings where id = p_listing for update;
  if not found then raise exception 'reventa no existe' using errcode='no_data_found'; end if;
  if v_status not in ('active','reserved') then raise exception 'reventa no disponible' using errcode='check_violation'; end if;

  v_newtok := encode(extensions.gen_random_bytes(24), 'hex');
  v_newsec := encode(extensions.gen_random_bytes(20), 'hex');
  update public.tickets set qr_token = v_newtok, totp_secret = v_newsec where id = v_ticket;
  select attendee_id into v_att from public.tickets where id = v_ticket;
  if v_att is not null then update public.attendees set email = p_buyer_email where id = v_att;
  else
    insert into public.attendees (order_id, email) select order_id, p_buyer_email from public.tickets where id = v_ticket returning id into v_att;
    update public.tickets set attendee_id = v_att where id = v_ticket;
  end if;

  insert into public.ticket_transfers (ticket_id, from_email, to_email, kind) values (v_ticket, v_seller, p_buyer_email, 'resale');
  update public.listings set status = 'sold' where id = p_listing;
  insert into public.resale_payouts (listing_id, seller_email, amount_cents) values (p_listing, v_seller, v_price);
  return v_newtok;
end $$;


--
-- Name: buyer_ticket_count(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buyer_ticket_count(p_event uuid, p_email text) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select coalesce(sum(oi.quantity), 0)::int
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.event_id = p_event and o.buyer_email = p_email and o.status = 'paid';
$$;


--
-- Name: cancel_event(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_event(p_event uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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
end $$;


--
-- Name: cancel_listing(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_listing(p_listing uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ update public.listings set status='cancelled' where id = p_listing and status='active'; $$;


--
-- Name: check_in_ticket(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_in_ticket(p_qr_token text) RETURNS TABLE(ticket_id uuid, event_id uuid, ok boolean, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_id uuid; v_event uuid; v_status text;
begin
  select id, event_id, status into v_id, v_event, v_status
  from public.tickets where qr_token = p_qr_token for update;

  if not found then
    return query select null::uuid, null::uuid, false, 'no_existe'; return;
  end if;
  if v_status <> 'valid' then
    return query select v_id, v_event, false, v_status; return;
  end if;

  update public.tickets
    set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid()
    where id = v_id;
  return query select v_id, v_event, true, 'ok';
end;
$$;


--
-- Name: cleanup_expired_holds(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_holds() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  with deleted as (
    delete from public.ticket_holds where expires_at <= now() returning 1
  ) select count(*)::int from deleted;
$$;


--
-- Name: cleanup_rate_hits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_rate_hits() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ with d as (delete from public.rate_hits where reset_at < now() - interval '1 hour' returning 1) select count(*)::int from d; $$;


--
-- Name: confirm_order_paid(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_order_paid(p_order_id uuid, p_payment_intent_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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

  -- SERVICIOS / EXTRAS: incrementa inventario vendido (guardado; no falla la orden).
  for srv in select service_id, quantity from public.order_services where order_id=p_order_id loop
    update public.services set sold = sold + srv.quantity
      where id = srv.service_id and (inventory is null or sold + srv.quantity <= inventory);
  end loop;

  delete from public.ticket_holds where order_id=p_order_id;
  if v_promo is not null then update public.promo_codes set times_redeemed = times_redeemed + 1 where id=v_promo; end if;
  update public.orders set status='paid', paid_at=now(),
    stripe_payment_intent_id=coalesce(stripe_payment_intent_id, p_payment_intent_id) where id=p_order_id;
end $$;


--
-- Name: confirm_season_pass(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_season_pass(p_order uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare o record; se record;
begin
  select * into o from public.orders where id = p_order for update;
  if o is null or o.season_id is null then raise exception 'orden de abono inválida'; end if;
  if o.status = 'paid' then return; end if;  -- idempotente

  for se in select event_id, ticket_type_id from public.season_events where season_id = o.season_id loop
    insert into public.tickets (order_id, ticket_type_id, event_id, qr_token, status)
    values (p_order, se.ticket_type_id, se.event_id, encode(gen_random_bytes(16), 'hex'), 'valid');
  end loop;

  update public.orders set status = 'paid', paid_at = now() where id = p_order;
end $$;


--
-- Name: consume_presale_code(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_presale_code(p_event uuid, p_code text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ update public.presale_registrations set used_at = now()
       where event_id = p_event and upper(code) = upper(trim(p_code)) and used_at is null; $$;


--
-- Name: create_hold(uuid, integer, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_hold(p_ticket_type uuid, p_quantity integer, p_session_id text, p_ttl_minutes integer DEFAULT 10) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_available int;
  v_max       int;
  v_hold_id   uuid;
begin
  select max_per_order into v_max
  from public.ticket_types where id = p_ticket_type for update;

  if not found then
    raise exception 'ticket_type % no existe', p_ticket_type using errcode = 'no_data_found';
  end if;
  if p_quantity < 1 or p_quantity > v_max then
    raise exception 'cantidad % fuera de rango (max %)', p_quantity, v_max using errcode = 'check_violation';
  end if;

  v_available := public.available_stock(p_ticket_type);
  if p_quantity > v_available then
    raise exception 'stock insuficiente: disponibles %, pedidos %', v_available, p_quantity using errcode = 'check_violation';
  end if;

  insert into public.ticket_holds (ticket_type_id, quantity, session_id, expires_at)
  values (p_ticket_type, p_quantity, p_session_id, now() + (p_ttl_minutes || ' minutes')::interval)
  returning id into v_hold_id;

  return v_hold_id;
end;
$$;


--
-- Name: create_organization(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_organization(p_name text, p_slug text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = 'insufficient_privilege';
  end if;

  insert into public.organizations (slug, name)
  values (p_slug, p_name)
  returning id into v_org;

  insert into public.org_members (org_id, user_id, role)
  values (v_org, v_uid, 'owner');

  return v_org;
end;
$$;


--
-- Name: delete_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_order(p_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  -- Libera inventario de boletos (solo los emitidos que contaban como vendidos).
  update public.ticket_types tt
    set quantity_sold = greatest(0, tt.quantity_sold - t.cnt)
    from (
      select ticket_type_id, count(*)::int cnt from public.tickets
      where order_id = p_order_id and status in ('valid','checked_in') and ticket_type_id is not null
      group by ticket_type_id
    ) t
    where tt.id = t.ticket_type_id;

  -- Libera inventario de servicios/extras.
  update public.services s
    set sold = greatest(0, s.sold - os.qty)
    from (select service_id, sum(quantity)::int qty from public.order_services where order_id = p_order_id group by service_id) os
    where s.id = os.service_id;

  -- Libera asientos reservados.
  update public.seats set order_id = null, status = 'available', hold_session = null, hold_expires_at = null where order_id = p_order_id;
  update public.event_seats set order_id = null, status = 'available', hold_session = null, hold_expires_at = null where order_id = p_order_id;

  -- Borra dependientes y la orden.
  delete from public.checkin_log where ticket_id in (select id from public.tickets where order_id = p_order_id);
  delete from public.tickets where order_id = p_order_id;
  delete from public.order_services where order_id = p_order_id;
  delete from public.order_items where order_id = p_order_id;
  delete from public.ticket_holds where order_id = p_order_id;
  delete from public.orders where id = p_order_id;
end; $$;


--
-- Name: delete_venue(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_venue(p_venue uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from public.venues_v2 v join public.org_members m on m.org_id = v.org_id where v.id = p_venue and m.user_id = auth.uid()) then
    raise exception 'no autorizado';
  end if;
  -- Bloquea si algún mapa del recinto está asignado a un evento (rompería la venta/asientos).
  if exists (select 1 from public.event_maps em join public.venue_maps vm on vm.id = em.map_id where vm.venue_id = p_venue) then
    raise exception 'EN_USO';
  end if;
  delete from public.venues_v2 where id = p_venue;  -- cascada: maps → zones → seats/pricing/rows
end; $$;


--
-- Name: delete_zone(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_zone(p_zone uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_map uuid;
begin
  select map_id into v_map from public.zones where id = p_zone;
  if not public.is_org_member(public.map_org(v_map), array['owner','admin','staff']) then
    raise exception 'no autorizado' using errcode='insufficient_privilege';
  end if;
  delete from public.zones where id = p_zone;
end $$;


--
-- Name: email_optout(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.email_optout(p_email text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into public.email_optouts(email) values (lower(p_email))
  on conflict (email) do nothing;
$$;


--
-- Name: event_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_org(target_event uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select org_id from public.events where id = target_event; $$;


--
-- Name: events_search_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.events_search_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.city,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.category,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.description,'')), 'C');
  return new;
end;
$$;


--
-- Name: generate_seats(uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_seats(p_ticket_type uuid, p_section text, p_rows integer, p_cols integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_event uuid; v_org uuid; r int; c int; n int := 0;
begin
  select tt.event_id, e.org_id into v_event, v_org
  from public.ticket_types tt join public.events e on e.id = tt.event_id
  where tt.id = p_ticket_type;
  if v_org is null then raise exception 'tier no existe' using errcode='no_data_found'; end if;
  if not public.is_org_member(v_org, array['owner','admin','staff']) then
    raise exception 'no autorizado' using errcode='insufficient_privilege';
  end if;
  if p_rows < 1 or p_cols < 1 or p_rows*p_cols > 2000 then
    raise exception 'dimensiones inválidas' using errcode='check_violation';
  end if;

  for r in 1..p_rows loop
    for c in 1..p_cols loop
      insert into public.seats (event_id, ticket_type_id, section, row_label, seat_num, pos_x, pos_y)
      values (v_event, p_ticket_type, p_section, chr(64 + r), c, c, r);
      n := n + 1;
    end loop;
  end loop;

  update public.ticket_types set is_seated = true, quantity_total = quantity_total + n where id = p_ticket_type;
  return n;
end $$;


--
-- Name: generate_zone_seats(uuid, integer, integer, text, integer, numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_zone_seats(p_zone uuid, p_rows integer, p_cols integer, p_row_start text DEFAULT 'A'::text, p_seat_start integer DEFAULT 1, p_origin_x numeric DEFAULT 0, p_origin_y numeric DEFAULT 0, p_dx numeric DEFAULT 1, p_dy numeric DEFAULT 1) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_map uuid; r int; c int; n int := 0; v_row uuid; v_label text;
begin
  select map_id into v_map from public.zones where id = p_zone;
  if v_map is null then raise exception 'zona no existe' using errcode='no_data_found'; end if;
  if not public.is_org_member(public.map_org(v_map), array['owner','admin','staff']) then
    raise exception 'no autorizado' using errcode='insufficient_privilege';
  end if;
  if p_rows < 1 or p_cols < 1 or p_rows*p_cols > 5000 then raise exception 'dimensiones inválidas' using errcode='check_violation'; end if;

  for r in 0..(p_rows-1) loop
    v_label := chr(ascii(p_row_start) + r);
    insert into public.rows (zone_id, label, display_order) values (p_zone, v_label, r) returning id into v_row;
    for c in 0..(p_cols-1) loop
      insert into public.venue_seats (map_id, zone_id, row_id, label, pos)
      values (v_map, p_zone, v_row, (p_seat_start + c)::text,
              extensions.ST_SetSRID(extensions.ST_MakePoint(p_origin_x + c*p_dx, p_origin_y + r*p_dy), 0));
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;


--
-- Name: hit_rate_limit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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


--
-- Name: hold_event_seats(uuid[], text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hold_event_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes integer DEFAULT 10) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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


--
-- Name: hold_seats(uuid[], text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hold_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes integer DEFAULT 10) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare s record;
begin
  for s in select id, status, hold_expires_at from public.seats where id = any(p_seat_ids) for update loop
    if s.status = 'sold' or (s.status = 'held' and s.hold_expires_at > now()) then
      raise exception 'asiento no disponible' using errcode='check_violation';
    end if;
  end loop;
  update public.seats
    set status='held', hold_session=p_session, hold_expires_at = now() + (p_ttl_minutes||' minutes')::interval
    where id = any(p_seat_ids);
end $$;


--
-- Name: is_org_member(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_member(target_org uuid, min_roles text[] DEFAULT ARRAY['owner'::text, 'admin'::text, 'staff'::text, 'scanner'::text]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role = any(min_roles)
  );
$$;


--
-- Name: is_queue_admitted(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_queue_admitted(p_event uuid, p_token text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select exists (select 1 from public.queue_sessions
    where event_id = p_event and token = p_token and status = 'admitted' and admit_expires_at > now());
$$;


--
-- Name: join_queue(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_queue(p_event uuid, p_token text, p_identity text) RETURNS TABLE(token text, status text, pos integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_enabled boolean; v_drawn boolean; v_onsale timestamptz; existing record; v_pos int;
begin
  select queue_enabled, queue_drawn, onsale_at into v_enabled, v_drawn, v_onsale from public.events where id = p_event;
  if not coalesce(v_enabled, false) then raise exception 'evento sin cola' using errcode='check_violation'; end if;

  select s.token, s.status, s.position into existing from public.queue_sessions s
    where s.event_id = p_event and s.identity_hash = p_identity and s.status in ('waiting','admitted') limit 1;
  if found then
    return query select existing.token, existing.status, existing.position; return;
  end if;

  if v_drawn and v_onsale is not null and v_onsale <= now() then
    select coalesce(max(position),0)+1 into v_pos from public.queue_sessions where event_id = p_event;
  else
    v_pos := null;
  end if;

  insert into public.queue_sessions (event_id, token, identity_hash, position)
  values (p_event, p_token, p_identity, v_pos);
  return query select p_token, 'waiting'::text, v_pos;
end $$;


--
-- Name: list_ticket(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_ticket(p_token text, p_price_cents integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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
  -- email del vendedor: attendee si existe, si no el comprador de la orden.
  select coalesce(a.email, o.buyer_email) into v_from
    from public.tickets t
    left join public.attendees a on a.id = t.attendee_id
    join public.orders o on o.id = t.order_id
    where t.id = v_ticket;
  insert into public.listings (ticket_id, event_id, seller_email, price_cents) values (v_ticket, v_event, v_from, p_price_cents) returning id into v_listing;
  return v_listing;
end $$;


--
-- Name: map_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.map_org(p_map uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select v.org_id from public.venue_maps m join public.venues_v2 v on v.id = m.venue_id where m.id = p_map $$;


--
-- Name: mark_queue_used(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_queue_used(p_token text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ update public.queue_sessions set status='used' where token = p_token and status='admitted'; $$;


--
-- Name: publish_map(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_map(p_map uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  if not public.is_org_member(public.map_org(p_map), array['owner','admin','staff']) then
    raise exception 'no autorizado' using errcode='insufficient_privilege';
  end if;
  update public.venue_maps set status='published' where id = p_map;
end $$;


--
-- Name: queue_status(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.queue_status(p_event uuid, p_token text) RETURNS TABLE(status text, pos integer, ahead integer, admit_expires_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select s.status, s.position,
    (select count(*)::int from public.queue_sessions q
     where q.event_id = p_event and q.status='waiting' and q.position is not null and q.position < s.position),
    s.admit_expires_at
  from public.queue_sessions s where s.token = p_token and s.event_id = p_event;
$$;


--
-- Name: recalibrate_map(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalibrate_map(p_map uuid, p_factor numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  if not public.is_org_member(public.map_org(p_map), array['owner','admin','staff']) then
    raise exception 'no autorizado' using errcode='insufficient_privilege';
  end if;
  if p_factor <= 0 or p_factor > 10000 then raise exception 'factor inválido' using errcode='check_violation'; end if;

  update public.venue_maps
    set width_m = width_m * p_factor, height_m = height_m * p_factor
    where id = p_map;
  update public.zones set area = extensions.ST_Scale(area, p_factor, p_factor) where map_id = p_map and area is not null;
  update public.venue_seats set pos = extensions.ST_Scale(pos, p_factor, p_factor) where map_id = p_map;
end $$;


--
-- Name: refund_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refund_order(p_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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

    -- SERVICIOS: devuelve inventario.
    for srv in select service_id, quantity from public.order_services where order_id=p_order_id loop
      update public.services set sold = greatest(0, sold - srv.quantity) where id = srv.service_id;
    end loop;

    update public.tickets set status='refunded' where order_id=p_order_id and status in ('valid','checked_in');
    if v_promo is not null then update public.promo_codes set times_redeemed = greatest(0, times_redeemed-1) where id=v_promo; end if;
    update public.orders set status='refunded' where id=p_order_id;
  else
    update public.orders set status='cancelled' where id=p_order_id;
  end if;
end $$;


--
-- Name: register_presale(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_presale(p_event uuid, p_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  if not exists (select 1 from public.events where id = p_event and presale_enabled) then
    raise exception 'presale no disponible' using errcode='check_violation';
  end if;
  insert into public.presale_registrations (event_id, email) values (p_event, lower(trim(p_email)))
  on conflict (event_id, email) do nothing;
end $$;


--
-- Name: release_expired_event_seats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_expired_event_seats() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  with upd as (
    update public.event_seats set status='available', hold_session=null, hold_expires_at=null
    where status='held' and hold_expires_at <= now() and order_id is null returning 1
  ) select count(*)::int from upd;
$$;


--
-- Name: release_expired_seats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_expired_seats() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  with upd as (
    update public.seats set status='available', hold_session=null, hold_expires_at=null
    where status='held' and hold_expires_at <= now() and order_id is null returning 1
  ) select count(*)::int from upd;
$$;


--
-- Name: release_listing(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_listing(p_listing uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  update public.listings set status = 'active' where id = p_listing and status = 'reserved';
$$;


--
-- Name: release_season_pass(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_season_pass(p_season uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  update public.seasons set quantity_sold = greatest(0, quantity_sold - 1) where id = p_season;
  update public.ticket_types tt set quantity_sold = greatest(0, quantity_sold - 1)
    where tt.id in (select ticket_type_id from public.season_events where season_id = p_season);
end $$;


--
-- Name: reserve_listing(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_listing(p_listing uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_status text;
begin
  select status into v_status from public.listings where id = p_listing for update;
  if v_status is distinct from 'active' then return false; end if;
  update public.listings set status = 'reserved' where id = p_listing;
  return true;
end $$;


--
-- Name: reserve_season_pass(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_season_pass(p_season uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare s record; se record;
begin
  select * into s from public.seasons where id = p_season for update;
  if s is null or s.status <> 'published' then return false; end if;
  if s.quantity_sold + 1 > s.quantity_total then return false; end if;

  -- verificar cupo en cada evento
  for se in select event_id, ticket_type_id from public.season_events where season_id = p_season loop
    perform 1 from public.ticket_types tt where tt.id = se.ticket_type_id
      and tt.quantity_sold + 1 <= tt.quantity_total for update;
    if not found then return false; end if;
  end loop;

  -- incrementar todo
  update public.seasons set quantity_sold = quantity_sold + 1 where id = p_season;
  update public.ticket_types tt set quantity_sold = quantity_sold + 1
    where tt.id in (select ticket_type_id from public.season_events where season_id = p_season);
  return true;
end $$;


--
-- Name: run_presale_lottery(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_presale_lottery(p_event uuid, p_count integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare n int;
begin
  if not public.is_org_member(public.event_org(p_event), array['owner','admin','staff']) then
    raise exception 'no autorizado' using errcode='insufficient_privilege';
  end if;
  with picked as (
    select id from public.presale_registrations where event_id = p_event and not selected
    order by random() limit greatest(0, p_count)
  )
  update public.presale_registrations r
    set selected = true, code = upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8))
  from picked where r.id = picked.id;
  get diagnostics n = row_count;
  return n;
end $$;


--
-- Name: save_zone(uuid, text, text, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_zone(p_map uuid, p_name text, p_kind text, p_color text, p_points jsonb, p_ga_capacity integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_zone uuid; wkt text := ''; pt jsonb; first jsonb;
begin
  if not public.is_org_member(public.map_org(p_map), array['owner','admin','staff']) then
    raise exception 'no autorizado' using errcode='insufficient_privilege';
  end if;
  if jsonb_array_length(p_points) < 3 then raise exception 'polígono inválido' using errcode='check_violation'; end if;

  for pt in select * from jsonb_array_elements(p_points) loop
    wkt := wkt || (pt->>0) || ' ' || (pt->>1) || ',';
  end loop;
  first := p_points->0;
  wkt := wkt || (first->>0) || ' ' || (first->>1);  -- cierra el anillo

  insert into public.zones (map_id, name, kind, color, ga_capacity, area)
  values (p_map, p_name, p_kind, coalesce(p_color,'#7c3aed'), p_ga_capacity,
          extensions.ST_GeomFromText('POLYGON((' || wkt || '))', 0))
  returning id into v_zone;
  return v_zone;
end $$;


--
-- Name: set_zone_price(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_zone_price(p_event uuid, p_zone uuid, p_price integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_tt uuid;
begin
  if not public.is_org_member(public.event_org(p_event), array['owner','admin','staff']) then
    raise exception 'no autorizado' using errcode='insufficient_privilege';
  end if;
  update public.event_zone_pricing set price_cents = p_price
    where event_id = p_event and zone_id = p_zone returning ticket_type_id into v_tt;
  if v_tt is not null then update public.ticket_types set price_cents = p_price where id = v_tt; end if;
end $$;


--
-- Name: staff_session(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_session(p_token text) RETURNS TABLE(staff_id uuid, event_id uuid, staff_name text, gate text, role text, revoked boolean, expired boolean, event_title text, cover_image text, starts_at timestamp with time zone, ends_at timestamp with time zone, timezone text, city text, region text, is_online boolean, safetix_enabled boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select s.id, s.event_id, s.name, s.gate, s.role, s.revoked,
    (s.expires_at is not null and s.expires_at < now()) as expired,
    e.title, e.cover_image, e.starts_at, e.ends_at, e.timezone, e.city, e.region, e.is_online, e.safetix_enabled
  from public.event_staff s join public.events e on e.id = s.event_id
  where s.token = p_token limit 1;
$$;


--
-- Name: ticket_brand(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ticket_brand(p_token text) RETURNS TABLE(name text, logo_url text, white_label boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select o.name, o.logo_url, o.white_label
  from public.tickets t
  join public.events e on e.id = t.event_id
  join public.organizations o on o.id = e.org_id
  where t.qr_token = p_token
  limit 1;
$$;


--
-- Name: ticket_event_info(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ticket_event_info(p_token text) RETURNS TABLE(title text, slug text, starts_at timestamp with time zone, ends_at timestamp with time zone, timezone text, cover_image text, type_name text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select e.title, e.slug, e.starts_at, e.ends_at, e.timezone, e.cover_image, tt.name
  from public.tickets t
  join public.events e on e.id = t.event_id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  where t.qr_token = p_token
  limit 1;
$$;


--
-- Name: ticket_rotating_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ticket_rotating_code(p_token text) RETURNS TABLE(bearer text, otp text, counter bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_secret text; v_counter bigint;
begin
  select totp_secret into v_secret from public.tickets where qr_token = p_token;
  if v_secret is null then return query select p_token, ''::text, 0::bigint; return; end if;
  v_counter := floor(extract(epoch from now()) / 15)::bigint;
  return query select p_token,
    substr(encode(extensions.hmac(int8send(v_counter), decode(v_secret, 'hex'), 'sha1'), 'hex'), 1, 10),
    v_counter;
end $$;


--
-- Name: transfer_ticket(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_ticket(p_token text, p_to_email text, p_kind text DEFAULT 'transfer'::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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
end $$;


--
-- Name: validate_presale_code(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_presale_code(p_event uuid, p_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select exists (select 1 from public.presale_registrations
    where event_id = p_event and upper(code) = upper(trim(p_code)) and selected and used_at is null);
$$;


--
-- Name: validate_promo_code(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_promo_code(p_event uuid, p_code text) RETURNS TABLE(valid boolean, reason text, promo_id uuid, discount_type text, discount_value integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare p record;
begin
  select * into p from public.promo_codes
    where event_id = p_event and upper(code) = upper(trim(p_code)) limit 1;
  if not found then
    return query select false, 'Código no válido', null::uuid, null::text, null::int; return;
  end if;
  if p.expires_at is not null and p.expires_at < now() then
    return query select false, 'Código expirado', null::uuid, null::text, null::int; return;
  end if;
  if p.max_redemptions is not null and p.times_redeemed >= p.max_redemptions then
    return query select false, 'Código agotado', null::uuid, null::text, null::int; return;
  end if;
  return query select true, 'ok', p.id, p.discount_type, p.discount_value;
end $$;


--
-- Name: verify_rotating_code(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_rotating_code(p_token text, p_otp text, p_counter bigint) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_secret text; v_now bigint; v_expected text;
begin
  select totp_secret into v_secret from public.tickets where qr_token = p_token;
  if v_secret is null then return false; end if;
  v_now := floor(extract(epoch from now()) / 15)::bigint;
  if p_counter < v_now - 2 or p_counter > v_now + 1 then return false; end if;  -- anti-screenshot/replay
  v_expected := substr(encode(extensions.hmac(int8send(p_counter), decode(v_secret, 'hex'), 'sha1'), 'hex'), 1, 10);
  return v_expected = p_otp;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attendees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    first_name text,
    last_name text,
    email text
);


--
-- Name: campaign_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    email text NOT NULL,
    country text,
    ticket_type text,
    resend_id text,
    delivered boolean DEFAULT false NOT NULL,
    opened boolean DEFAULT false NOT NULL,
    clicked boolean DEFAULT false NOT NULL,
    bounced boolean DEFAULT false NOT NULL,
    complained boolean DEFAULT false NOT NULL,
    unsubscribed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    preheader text,
    from_name text,
    reply_to text,
    body_html text,
    segment jsonb DEFAULT '{"type": "all"}'::jsonb NOT NULL,
    scheduled_at timestamp with time zone,
    timezone text,
    status text DEFAULT 'draft'::text NOT NULL,
    recipients_count integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    kind text DEFAULT 'manual'::text NOT NULL,
    automation_key text,
    delivered_count integer DEFAULT 0 NOT NULL,
    opened_count integer DEFAULT 0 NOT NULL,
    clicked_count integer DEFAULT 0 NOT NULL,
    bounced_count integer DEFAULT 0 NOT NULL,
    unsub_count integer DEFAULT 0 NOT NULL
);


--
-- Name: checkin_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkin_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    staff_id uuid,
    gate text,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    recipients integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_optouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_optouts (
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_change_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_change_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changes jsonb DEFAULT '[]'::jsonb NOT NULL,
    recipients_count integer DEFAULT 0 NOT NULL,
    channels text[] DEFAULT '{email}'::text[] NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL
);


--
-- Name: event_maps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_maps (
    event_id uuid NOT NULL,
    map_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_seats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    venue_seat_id uuid NOT NULL,
    zone_id uuid NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    hold_session text,
    hold_expires_at timestamp with time zone,
    order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_seats_status_check CHECK ((status = ANY (ARRAY['available'::text, 'held'::text, 'sold'::text])))
);


--
-- Name: event_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    gate text,
    role text DEFAULT 'checkin'::text NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone,
    revoked boolean DEFAULT false NOT NULL,
    scans_count integer DEFAULT 0 NOT NULL,
    last_active_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_zone_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_zone_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    zone_id uuid NOT NULL,
    ticket_type_id uuid,
    price_cents integer NOT NULL,
    CONSTRAINT event_zone_pricing_price_cents_check CHECK ((price_cents >= 0))
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    venue_id uuid,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    cover_image text,
    category text,
    status text DEFAULT 'draft'::text NOT NULL,
    is_online boolean DEFAULT false NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    timezone text NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    city text,
    region text,
    search_vector tsvector,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    queue_enabled boolean DEFAULT false NOT NULL,
    onsale_at timestamp with time zone,
    queue_wave_size integer DEFAULT 50 NOT NULL,
    queue_admit_minutes integer DEFAULT 10 NOT NULL,
    queue_drawn boolean DEFAULT false NOT NULL,
    max_tickets_per_buyer integer,
    safetix_enabled boolean DEFAULT false NOT NULL,
    presale_enabled boolean DEFAULT false NOT NULL,
    presale_ends_at timestamp with time zone,
    notify_on_change boolean DEFAULT true NOT NULL,
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text, 'ended'::text])))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    message text,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    event_id uuid NOT NULL,
    seller_email text,
    price_cents integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT listings_price_cents_check CHECK ((price_cents >= 0)),
    CONSTRAINT listings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'sold'::text, 'cancelled'::text])))
);


--
-- Name: notification_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    log_id uuid,
    type text DEFAULT 'event_change'::text NOT NULL,
    payload jsonb NOT NULL,
    channels text[] DEFAULT '{email}'::text[] NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    recipients_count integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    ticket_type_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price_cents integer NOT NULL,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: order_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    service_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price_cents integer NOT NULL,
    CONSTRAINT order_services_quantity_check CHECK ((quantity > 0))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    org_id uuid NOT NULL,
    buyer_user_id uuid,
    buyer_email text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    subtotal_cents integer NOT NULL,
    platform_fee_cents integer DEFAULT 0 NOT NULL,
    total_cents integer NOT NULL,
    currency text NOT NULL,
    stripe_payment_intent_id text,
    idempotency_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    discount_cents integer DEFAULT 0 NOT NULL,
    promo_code_id uuid,
    season_id uuid,
    manage_token text,
    buyer_name text,
    buyer_phone text,
    buyer_city text,
    buyer_country text,
    CONSTRAINT orders_event_or_season CHECK (((event_id IS NOT NULL) OR (season_id IS NOT NULL))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text, 'cancelled'::text])))
);


--
-- Name: org_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_members (
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text, 'scanner'::text])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    stripe_account_id text,
    payouts_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_url text,
    brand_color text,
    white_label boolean DEFAULT false NOT NULL
);


--
-- Name: payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    stripe_transfer_id text,
    amount_cents integer NOT NULL,
    currency text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payouts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text])))
);


--
-- Name: presale_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.presale_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    email text NOT NULL,
    selected boolean DEFAULT false NOT NULL,
    code text,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    code text NOT NULL,
    discount_type text NOT NULL,
    discount_value integer NOT NULL,
    max_redemptions integer,
    times_redeemed integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT promo_codes_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text]))),
    CONSTRAINT promo_codes_discount_value_check CHECK ((discount_value > 0))
);


--
-- Name: queue_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queue_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    token text NOT NULL,
    identity_hash text NOT NULL,
    "position" integer,
    status text DEFAULT 'waiting'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    admitted_at timestamp with time zone,
    admit_expires_at timestamp with time zone,
    CONSTRAINT queue_sessions_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'admitted'::text, 'expired'::text, 'used'::text])))
);


--
-- Name: rate_hits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_hits (
    key text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    reset_at timestamp with time zone NOT NULL
);


--
-- Name: resale_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resale_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    seller_email text,
    amount_cents integer NOT NULL,
    status text DEFAULT 'owed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    claim_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text) NOT NULL,
    stripe_transfer_id text,
    paid_at timestamp with time zone,
    CONSTRAINT resale_payouts_status_check CHECK ((status = ANY (ARRAY['owed'::text, 'paid'::text])))
);


--
-- Name: rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    zone_id uuid NOT NULL,
    label text NOT NULL,
    curve jsonb,
    display_order integer DEFAULT 0 NOT NULL
);


--
-- Name: season_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.season_events (
    season_id uuid NOT NULL,
    event_id uuid NOT NULL,
    ticket_type_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    currency text DEFAULT 'mxn'::text NOT NULL,
    price_cents integer NOT NULL,
    quantity_total integer NOT NULL,
    quantity_sold integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seasons_check CHECK ((quantity_sold <= quantity_total)),
    CONSTRAINT seasons_price_cents_check CHECK ((price_cents >= 0)),
    CONSTRAINT seasons_quantity_total_check CHECK ((quantity_total >= 0))
);


--
-- Name: seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    ticket_type_id uuid NOT NULL,
    section text NOT NULL,
    row_label text NOT NULL,
    seat_num integer NOT NULL,
    pos_x integer NOT NULL,
    pos_y integer NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    hold_session text,
    hold_expires_at timestamp with time zone,
    order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seats_status_check CHECK ((status = ANY (ARRAY['available'::text, 'held'::text, 'sold'::text])))
);


--
-- Name: seller_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_accounts (
    email text NOT NULL,
    stripe_account_id text,
    payouts_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'extra'::text NOT NULL,
    price_cents integer NOT NULL,
    currency text NOT NULL,
    inventory integer,
    sold integer DEFAULT 0 NOT NULL,
    max_per_order integer DEFAULT 10 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT services_check CHECK (((inventory IS NULL) OR (sold <= inventory))),
    CONSTRAINT services_kind_check CHECK ((kind = ANY (ARRAY['food'::text, 'drink'::text, 'parking'::text, 'merch'::text, 'vip'::text, 'access'::text, 'extra'::text]))),
    CONSTRAINT services_price_cents_check CHECK ((price_cents >= 0))
);


--
-- Name: ticket_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_type_id uuid NOT NULL,
    quantity integer NOT NULL,
    session_id text NOT NULL,
    order_id uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_holds_quantity_check CHECK ((quantity > 0))
);


--
-- Name: ticket_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    from_email text,
    to_email text NOT NULL,
    kind text DEFAULT 'transfer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_transfers_kind_check CHECK ((kind = ANY (ARRAY['transfer'::text, 'resale'::text])))
);


--
-- Name: ticket_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    price_cents integer NOT NULL,
    currency text NOT NULL,
    quantity_total integer NOT NULL,
    quantity_sold integer DEFAULT 0 NOT NULL,
    max_per_order integer DEFAULT 10 NOT NULL,
    sales_start timestamp with time zone,
    sales_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_seated boolean DEFAULT false NOT NULL,
    CONSTRAINT no_oversell CHECK ((quantity_sold <= quantity_total)),
    CONSTRAINT ticket_types_max_per_order_check CHECK ((max_per_order > 0)),
    CONSTRAINT ticket_types_price_cents_check CHECK ((price_cents >= 0)),
    CONSTRAINT ticket_types_quantity_sold_check CHECK ((quantity_sold >= 0)),
    CONSTRAINT ticket_types_quantity_total_check CHECK ((quantity_total >= 0))
);


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    ticket_type_id uuid NOT NULL,
    event_id uuid NOT NULL,
    attendee_id uuid,
    qr_token text NOT NULL,
    status text DEFAULT 'valid'::text NOT NULL,
    checked_in_at timestamp with time zone,
    checked_in_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seat_id uuid,
    totp_secret text DEFAULT encode(extensions.gen_random_bytes(20), 'hex'::text),
    checked_in_by_staff uuid,
    checked_in_gate text,
    CONSTRAINT tickets_status_check CHECK ((status = ANY (ARRAY['valid'::text, 'checked_in'::text, 'void'::text, 'refunded'::text])))
);


--
-- Name: venue_maps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_maps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    width_m numeric DEFAULT 100 NOT NULL,
    height_m numeric DEFAULT 100 NOT NULL,
    background_url text,
    scale_px_per_m numeric,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT venue_maps_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: venue_seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_seats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    map_id uuid NOT NULL,
    zone_id uuid NOT NULL,
    row_id uuid,
    label text NOT NULL,
    pos extensions.geometry(Point) NOT NULL,
    rotation numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: venue_seats_geo; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.venue_seats_geo WITH (security_invoker='true') AS
 SELECT id,
    map_id,
    zone_id,
    row_id,
    label,
    extensions.st_x(pos) AS x,
    extensions.st_y(pos) AS y,
    rotation
   FROM public.venue_seats;


--
-- Name: venues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    address text,
    city text,
    country text,
    lat double precision,
    lng double precision,
    capacity integer
);


--
-- Name: venues_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venues_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    address text,
    city text,
    region text,
    country text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    ticket_type_id uuid,
    email text NOT NULL,
    notified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zone_availability; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.zone_availability WITH (security_invoker='true') AS
 SELECT event_id,
    zone_id,
    count(*) FILTER (WHERE (status = 'available'::text)) AS available,
    count(*) FILTER (WHERE (status = 'held'::text)) AS held,
    count(*) FILTER (WHERE (status = 'sold'::text)) AS sold,
    count(*) AS total
   FROM public.event_seats
  GROUP BY event_id, zone_id;


--
-- Name: zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    map_id uuid NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'seated'::text NOT NULL,
    area extensions.geometry(Polygon),
    color text DEFAULT '#7c3aed'::text,
    ga_capacity integer,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT zones_kind_check CHECK ((kind = ANY (ARRAY['seated'::text, 'ga'::text, 'table'::text, 'standing'::text])))
);


--
-- Name: zones_geo; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.zones_geo WITH (security_invoker='true') AS
 SELECT id,
    map_id,
    name,
    kind,
    color,
    ga_capacity,
    display_order,
    extensions.st_asgeojson(area) AS area_geojson
   FROM public.zones;


--
-- Name: attendees attendees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendees
    ADD CONSTRAINT attendees_pkey PRIMARY KEY (id);


--
-- Name: campaign_emails campaign_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_emails
    ADD CONSTRAINT campaign_emails_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: checkin_log checkin_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_log
    ADD CONSTRAINT checkin_log_pkey PRIMARY KEY (id);


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: email_optouts email_optouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_optouts
    ADD CONSTRAINT email_optouts_pkey PRIMARY KEY (email);


--
-- Name: event_change_log event_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_change_log
    ADD CONSTRAINT event_change_log_pkey PRIMARY KEY (id);


--
-- Name: event_maps event_maps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_maps
    ADD CONSTRAINT event_maps_pkey PRIMARY KEY (event_id);


--
-- Name: event_seats event_seats_event_id_venue_seat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_seats
    ADD CONSTRAINT event_seats_event_id_venue_seat_id_key UNIQUE (event_id, venue_seat_id);


--
-- Name: event_seats event_seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_seats
    ADD CONSTRAINT event_seats_pkey PRIMARY KEY (id);


--
-- Name: event_staff event_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_staff
    ADD CONSTRAINT event_staff_pkey PRIMARY KEY (id);


--
-- Name: event_staff event_staff_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_staff
    ADD CONSTRAINT event_staff_token_key UNIQUE (token);


--
-- Name: event_zone_pricing event_zone_pricing_event_id_zone_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_zone_pricing
    ADD CONSTRAINT event_zone_pricing_event_id_zone_id_key UNIQUE (event_id, zone_id);


--
-- Name: event_zone_pricing event_zone_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_zone_pricing
    ADD CONSTRAINT event_zone_pricing_pkey PRIMARY KEY (id);


--
-- Name: events events_org_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_org_id_slug_key UNIQUE (org_id, slug);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: listings listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);


--
-- Name: notification_jobs notification_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_jobs
    ADD CONSTRAINT notification_jobs_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_services order_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_services
    ADD CONSTRAINT order_services_pkey PRIMARY KEY (id);


--
-- Name: orders orders_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- Name: org_members org_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_pkey PRIMARY KEY (org_id, user_id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: presale_registrations presale_registrations_event_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presale_registrations
    ADD CONSTRAINT presale_registrations_event_id_email_key UNIQUE (event_id, email);


--
-- Name: presale_registrations presale_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presale_registrations
    ADD CONSTRAINT presale_registrations_pkey PRIMARY KEY (id);


--
-- Name: promo_codes promo_codes_event_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_event_id_code_key UNIQUE (event_id, code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: queue_sessions queue_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_sessions
    ADD CONSTRAINT queue_sessions_pkey PRIMARY KEY (id);


--
-- Name: queue_sessions queue_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_sessions
    ADD CONSTRAINT queue_sessions_token_key UNIQUE (token);


--
-- Name: rate_hits rate_hits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_hits
    ADD CONSTRAINT rate_hits_pkey PRIMARY KEY (key);


--
-- Name: resale_payouts resale_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resale_payouts
    ADD CONSTRAINT resale_payouts_pkey PRIMARY KEY (id);


--
-- Name: rows rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rows
    ADD CONSTRAINT rows_pkey PRIMARY KEY (id);


--
-- Name: season_events season_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_events
    ADD CONSTRAINT season_events_pkey PRIMARY KEY (season_id, event_id);


--
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (id);


--
-- Name: seasons seasons_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_slug_key UNIQUE (slug);


--
-- Name: seats seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_pkey PRIMARY KEY (id);


--
-- Name: seats seats_ticket_type_id_section_row_label_seat_num_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_ticket_type_id_section_row_label_seat_num_key UNIQUE (ticket_type_id, section, row_label, seat_num);


--
-- Name: seller_accounts seller_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_accounts
    ADD CONSTRAINT seller_accounts_pkey PRIMARY KEY (email);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: ticket_holds ticket_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_holds
    ADD CONSTRAINT ticket_holds_pkey PRIMARY KEY (id);


--
-- Name: ticket_transfers ticket_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_pkey PRIMARY KEY (id);


--
-- Name: ticket_types ticket_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_qr_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_qr_token_key UNIQUE (qr_token);


--
-- Name: venue_maps venue_maps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_maps
    ADD CONSTRAINT venue_maps_pkey PRIMARY KEY (id);


--
-- Name: venue_seats venue_seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_seats
    ADD CONSTRAINT venue_seats_pkey PRIMARY KEY (id);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: venues_v2 venues_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues_v2
    ADD CONSTRAINT venues_v2_pkey PRIMARY KEY (id);


--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);


--
-- Name: zones zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_pkey PRIMARY KEY (id);


--
-- Name: campaign_emails_resend; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_emails_resend ON public.campaign_emails USING btree (resend_id);


--
-- Name: campaign_emails_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX campaign_emails_uniq ON public.campaign_emails USING btree (campaign_id, email);


--
-- Name: campaigns_auto_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX campaigns_auto_uniq ON public.campaigns USING btree (event_id, automation_key);


--
-- Name: campaigns_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_due_idx ON public.campaigns USING btree (status, scheduled_at);


--
-- Name: campaigns_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_event_idx ON public.campaigns USING btree (event_id, created_at DESC);


--
-- Name: checkin_log_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkin_log_event_idx ON public.checkin_log USING btree (event_id, at DESC);


--
-- Name: checkin_log_ticket_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX checkin_log_ticket_uniq ON public.checkin_log USING btree (ticket_id);


--
-- Name: event_change_log_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_change_log_event_idx ON public.event_change_log USING btree (event_id, changed_at DESC);


--
-- Name: event_seats_event_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_seats_event_status_idx ON public.event_seats USING btree (event_id, status);


--
-- Name: event_seats_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_seats_order_idx ON public.event_seats USING btree (order_id);


--
-- Name: event_seats_zone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_seats_zone_idx ON public.event_seats USING btree (zone_id);


--
-- Name: event_staff_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_staff_event_idx ON public.event_staff USING btree (event_id);


--
-- Name: events_discovery_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_discovery_idx ON public.events USING btree (region, city, category, starts_at) WHERE (status = 'published'::text);


--
-- Name: events_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_search_idx ON public.events USING gin (search_vector);


--
-- Name: events_status_starts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_status_starts_idx ON public.events USING btree (status, starts_at);


--
-- Name: leads_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_email_idx ON public.leads USING btree (lower(email));


--
-- Name: listings_event_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_event_active_idx ON public.listings USING btree (event_id, status);


--
-- Name: notification_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_jobs_status_idx ON public.notification_jobs USING btree (status, created_at);


--
-- Name: order_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_order_idx ON public.order_items USING btree (order_id);


--
-- Name: order_services_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_services_order_idx ON public.order_services USING btree (order_id);


--
-- Name: orders_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_buyer_idx ON public.orders USING btree (buyer_user_id);


--
-- Name: orders_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_event_idx ON public.orders USING btree (event_id);


--
-- Name: org_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_members_user_idx ON public.org_members USING btree (user_id);


--
-- Name: presale_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX presale_event_idx ON public.presale_registrations USING btree (event_id);


--
-- Name: queue_event_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX queue_event_status_idx ON public.queue_sessions USING btree (event_id, status, "position");


--
-- Name: queue_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX queue_one_active ON public.queue_sessions USING btree (event_id, identity_hash) WHERE (status = ANY (ARRAY['waiting'::text, 'admitted'::text]));


--
-- Name: resale_payouts_owed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resale_payouts_owed_idx ON public.resale_payouts USING btree (status) WHERE (status = 'owed'::text);


--
-- Name: rows_zone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rows_zone_idx ON public.rows USING btree (zone_id);


--
-- Name: seasons_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seasons_org_idx ON public.seasons USING btree (org_id);


--
-- Name: seats_event_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seats_event_status_idx ON public.seats USING btree (event_id, status);


--
-- Name: seats_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seats_order_idx ON public.seats USING btree (order_id);


--
-- Name: services_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX services_event_idx ON public.services USING btree (event_id);


--
-- Name: ticket_holds_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_holds_active_idx ON public.ticket_holds USING btree (ticket_type_id, expires_at);


--
-- Name: ticket_types_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_types_event_idx ON public.ticket_types USING btree (event_id);


--
-- Name: tickets_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_event_idx ON public.tickets USING btree (event_id);


--
-- Name: tickets_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_order_idx ON public.tickets USING btree (order_id);


--
-- Name: venue_maps_venue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_maps_venue_idx ON public.venue_maps USING btree (venue_id);


--
-- Name: venue_seats_map_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_seats_map_idx ON public.venue_seats USING btree (map_id);


--
-- Name: venue_seats_pos_gix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_seats_pos_gix ON public.venue_seats USING gist (pos);


--
-- Name: venue_seats_zone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_seats_zone_idx ON public.venue_seats USING btree (zone_id);


--
-- Name: waitlist_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX waitlist_event_idx ON public.waitlist USING btree (event_id, created_at);


--
-- Name: zones_area_gix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zones_area_gix ON public.zones USING gist (area);


--
-- Name: zones_map_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zones_map_idx ON public.zones USING btree (map_id);


--
-- Name: events events_search_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER events_search_update BEFORE INSERT OR UPDATE OF title, city, category, description ON public.events FOR EACH ROW EXECUTE FUNCTION public.events_search_trigger();


--
-- Name: attendees attendees_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendees
    ADD CONSTRAINT attendees_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: campaign_emails campaign_emails_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_emails
    ADD CONSTRAINT campaign_emails_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: checkin_log checkin_log_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_log
    ADD CONSTRAINT checkin_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: checkin_log checkin_log_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_log
    ADD CONSTRAINT checkin_log_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.event_staff(id) ON DELETE SET NULL;


--
-- Name: checkin_log checkin_log_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_log
    ADD CONSTRAINT checkin_log_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: email_campaigns email_campaigns_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_change_log event_change_log_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_change_log
    ADD CONSTRAINT event_change_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_maps event_maps_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_maps
    ADD CONSTRAINT event_maps_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_maps event_maps_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_maps
    ADD CONSTRAINT event_maps_map_id_fkey FOREIGN KEY (map_id) REFERENCES public.venue_maps(id);


--
-- Name: event_seats event_seats_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_seats
    ADD CONSTRAINT event_seats_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_seats event_seats_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_seats
    ADD CONSTRAINT event_seats_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: event_seats event_seats_venue_seat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_seats
    ADD CONSTRAINT event_seats_venue_seat_id_fkey FOREIGN KEY (venue_seat_id) REFERENCES public.venue_seats(id) ON DELETE CASCADE;


--
-- Name: event_seats event_seats_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_seats
    ADD CONSTRAINT event_seats_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;


--
-- Name: event_staff event_staff_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_staff
    ADD CONSTRAINT event_staff_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_zone_pricing event_zone_pricing_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_zone_pricing
    ADD CONSTRAINT event_zone_pricing_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_zone_pricing event_zone_pricing_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_zone_pricing
    ADD CONSTRAINT event_zone_pricing_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id) ON DELETE SET NULL;


--
-- Name: event_zone_pricing event_zone_pricing_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_zone_pricing
    ADD CONSTRAINT event_zone_pricing_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;


--
-- Name: events events_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: events events_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: listings listings_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: listings listings_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: notification_jobs notification_jobs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_jobs
    ADD CONSTRAINT notification_jobs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: notification_jobs notification_jobs_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_jobs
    ADD CONSTRAINT notification_jobs_log_id_fkey FOREIGN KEY (log_id) REFERENCES public.event_change_log(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id);


--
-- Name: order_services order_services_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_services
    ADD CONSTRAINT order_services_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_services order_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_services
    ADD CONSTRAINT order_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: orders orders_buyer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_buyer_user_id_fkey FOREIGN KEY (buyer_user_id) REFERENCES auth.users(id);


--
-- Name: orders orders_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: orders orders_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: orders orders_promo_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id);


--
-- Name: orders orders_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: org_members org_members_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_members org_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payouts payouts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: presale_registrations presale_registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presale_registrations
    ADD CONSTRAINT presale_registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: promo_codes promo_codes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: queue_sessions queue_sessions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_sessions
    ADD CONSTRAINT queue_sessions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: resale_payouts resale_payouts_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resale_payouts
    ADD CONSTRAINT resale_payouts_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: rows rows_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rows
    ADD CONSTRAINT rows_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;


--
-- Name: season_events season_events_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_events
    ADD CONSTRAINT season_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: season_events season_events_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_events
    ADD CONSTRAINT season_events_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;


--
-- Name: season_events season_events_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_events
    ADD CONSTRAINT season_events_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id) ON DELETE RESTRICT;


--
-- Name: seasons seasons_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: seats seats_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: seats seats_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: seats seats_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id) ON DELETE CASCADE;


--
-- Name: services services_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: ticket_holds ticket_holds_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_holds
    ADD CONSTRAINT ticket_holds_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id) ON DELETE CASCADE;


--
-- Name: ticket_transfers ticket_transfers_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_types ticket_types_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_attendee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_attendee_id_fkey FOREIGN KEY (attendee_id) REFERENCES public.attendees(id);


--
-- Name: tickets tickets_checked_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES auth.users(id);


--
-- Name: tickets tickets_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: tickets tickets_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id);


--
-- Name: venue_maps venue_maps_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_maps
    ADD CONSTRAINT venue_maps_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues_v2(id) ON DELETE CASCADE;


--
-- Name: venue_seats venue_seats_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_seats
    ADD CONSTRAINT venue_seats_map_id_fkey FOREIGN KEY (map_id) REFERENCES public.venue_maps(id) ON DELETE CASCADE;


--
-- Name: venue_seats venue_seats_row_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_seats
    ADD CONSTRAINT venue_seats_row_id_fkey FOREIGN KEY (row_id) REFERENCES public.rows(id) ON DELETE CASCADE;


--
-- Name: venue_seats venue_seats_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_seats
    ADD CONSTRAINT venue_seats_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;


--
-- Name: venues venues_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: venues_v2 venues_v2_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues_v2
    ADD CONSTRAINT venues_v2_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: waitlist waitlist_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: waitlist waitlist_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id) ON DELETE CASCADE;


--
-- Name: zones zones_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_map_id_fkey FOREIGN KEY (map_id) REFERENCES public.venue_maps(id) ON DELETE CASCADE;


--
-- Name: attendees attendee_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendee_read ON public.attendees FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = attendees.order_id) AND ((o.buyer_user_id = auth.uid()) OR public.is_org_member(o.org_id))))));


--
-- Name: attendees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendees ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_emails campaign_emails_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_emails_read ON public.campaign_emails FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.campaigns c
     JOIN public.events e ON ((e.id = c.event_id)))
     JOIN public.org_members m ON ((m.org_id = e.org_id)))
  WHERE ((c.id = campaign_emails.campaign_id) AND (m.user_id = auth.uid())))));


--
-- Name: email_campaigns campaign_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_org_all ON public.email_campaigns USING (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text])) WITH CHECK (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns campaigns_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_org ON public.campaigns USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.org_members m ON ((m.org_id = e.org_id)))
  WHERE ((e.id = campaigns.event_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.org_members m ON ((m.org_id = e.org_id)))
  WHERE ((e.id = campaigns.event_id) AND (m.user_id = auth.uid())))));


--
-- Name: checkin_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checkin_log ENABLE ROW LEVEL SECURITY;

--
-- Name: checkin_log checkin_log_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY checkin_log_read ON public.checkin_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.org_members m ON ((m.org_id = e.org_id)))
  WHERE ((e.id = checkin_log.event_id) AND (m.user_id = auth.uid())))));


--
-- Name: email_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: email_optouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_optouts ENABLE ROW LEVEL SECURITY;

--
-- Name: event_maps emap_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY emap_read ON public.event_maps FOR SELECT USING (true);


--
-- Name: event_maps emap_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY emap_write ON public.event_maps USING (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text])) WITH CHECK (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: event_seats eseat_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eseat_read ON public.event_seats FOR SELECT USING (true);


--
-- Name: event_change_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_change_log ENABLE ROW LEVEL SECURITY;

--
-- Name: event_change_log event_change_log_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_change_log_read ON public.event_change_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.org_members m ON ((m.org_id = e.org_id)))
  WHERE ((e.id = event_change_log.event_id) AND (m.user_id = auth.uid())))));


--
-- Name: event_maps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_maps ENABLE ROW LEVEL SECURITY;

--
-- Name: events event_org_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_org_write ON public.events USING (public.is_org_member(org_id, ARRAY['owner'::text, 'admin'::text, 'staff'::text])) WITH CHECK (public.is_org_member(org_id, ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: events event_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_public_read ON public.events FOR SELECT USING (((status = 'published'::text) OR public.is_org_member(org_id)));


--
-- Name: event_seats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_seats ENABLE ROW LEVEL SECURITY;

--
-- Name: event_staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_staff ENABLE ROW LEVEL SECURITY;

--
-- Name: event_staff event_staff_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_staff_org ON public.event_staff USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.org_members m ON ((m.org_id = e.org_id)))
  WHERE ((e.id = event_staff.event_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.org_members m ON ((m.org_id = e.org_id)))
  WHERE ((e.id = event_staff.event_id) AND (m.user_id = auth.uid())))));


--
-- Name: event_zone_pricing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_zone_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: event_zone_pricing ezp_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ezp_read ON public.event_zone_pricing FOR SELECT USING (true);


--
-- Name: event_zone_pricing ezp_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ezp_write ON public.event_zone_pricing USING (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text])) WITH CHECK (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: listings listing_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_public_read ON public.listings FOR SELECT USING ((status = 'active'::text));


--
-- Name: listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_maps map_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY map_read ON public.venue_maps FOR SELECT USING (((status = 'published'::text) OR public.is_org_member(( SELECT v.org_id
   FROM public.venues_v2 v
  WHERE (v.id = venue_maps.venue_id)))));


--
-- Name: venue_maps map_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY map_write ON public.venue_maps USING (public.is_org_member(( SELECT v.org_id
   FROM public.venues_v2 v
  WHERE (v.id = venue_maps.venue_id)), ARRAY['owner'::text, 'admin'::text, 'staff'::text])) WITH CHECK (public.is_org_member(( SELECT v.org_id
   FROM public.venues_v2 v
  WHERE (v.id = venue_maps.venue_id)), ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: org_members member_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_admin_write ON public.org_members USING (public.is_org_member(org_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (public.is_org_member(org_id, ARRAY['owner'::text, 'admin'::text]));


--
-- Name: org_members member_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_self_read ON public.org_members FOR SELECT USING (((user_id = auth.uid()) OR public.is_org_member(org_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: notification_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_item_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_item_read ON public.order_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.buyer_user_id = auth.uid()) OR public.is_org_member(o.org_id))))));


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders order_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_owner_read ON public.orders FOR SELECT USING (((buyer_user_id = auth.uid()) OR public.is_org_member(org_id)));


--
-- Name: order_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_services ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations org_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_admin_write ON public.organizations USING (public.is_org_member(id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (public.is_org_member(id, ARRAY['owner'::text, 'admin'::text]));


--
-- Name: organizations org_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_member_read ON public.organizations FOR SELECT USING (public.is_org_member(id));


--
-- Name: org_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: order_services oservice_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY oservice_read ON public.order_services FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_services.order_id) AND ((o.buyer_user_id = auth.uid()) OR public.is_org_member(o.org_id))))));


--
-- Name: payouts payout_org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payout_org_read ON public.payouts FOR SELECT USING (public.is_org_member(org_id, ARRAY['owner'::text, 'admin'::text]));


--
-- Name: payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: presale_registrations presale_org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY presale_org_read ON public.presale_registrations FOR SELECT USING (public.is_org_member(public.event_org(event_id)));


--
-- Name: presale_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.presale_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes promo_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promo_org_all ON public.promo_codes USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = promo_codes.event_id) AND public.is_org_member(e.org_id, ARRAY['owner'::text, 'admin'::text, 'staff'::text]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = promo_codes.event_id) AND public.is_org_member(e.org_id, ARRAY['owner'::text, 'admin'::text, 'staff'::text])))));


--
-- Name: queue_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.queue_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_hits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_hits ENABLE ROW LEVEL SECURITY;

--
-- Name: resale_payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resale_payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: rows row_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY row_read ON public.rows FOR SELECT USING (true);


--
-- Name: rows row_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY row_write ON public.rows USING (public.is_org_member(public.map_org(( SELECT z.map_id
   FROM public.zones z
  WHERE (z.id = rows.zone_id))), ARRAY['owner'::text, 'admin'::text, 'staff'::text])) WITH CHECK (public.is_org_member(public.map_org(( SELECT z.map_id
   FROM public.zones z
  WHERE (z.id = rows.zone_id))), ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rows ENABLE ROW LEVEL SECURITY;

--
-- Name: season_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.season_events ENABLE ROW LEVEL SECURITY;

--
-- Name: season_events season_events_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY season_events_read ON public.season_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.seasons s
  WHERE ((s.id = season_events.season_id) AND ((s.status = 'published'::text) OR public.is_org_member(s.org_id))))));


--
-- Name: season_events season_events_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY season_events_write ON public.season_events USING ((EXISTS ( SELECT 1
   FROM public.seasons s
  WHERE ((s.id = season_events.season_id) AND public.is_org_member(s.org_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.seasons s
  WHERE ((s.id = season_events.season_id) AND public.is_org_member(s.org_id)))));


--
-- Name: seasons season_org_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY season_org_write ON public.seasons USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));


--
-- Name: seasons season_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY season_public_read ON public.seasons FOR SELECT USING (((status = 'published'::text) OR public.is_org_member(org_id)));


--
-- Name: seasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

--
-- Name: seats seat_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seat_public_read ON public.seats FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = seats.event_id) AND ((e.status = 'published'::text) OR public.is_org_member(e.org_id))))));


--
-- Name: venue_seats seat_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seat_read ON public.venue_seats FOR SELECT USING (true);


--
-- Name: venue_seats seat_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seat_write ON public.venue_seats USING (public.is_org_member(public.map_org(map_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text])) WITH CHECK (public.is_org_member(public.map_org(map_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: seats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: services service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_read ON public.services FOR SELECT USING (((active = true) OR public.is_org_member(public.event_org(event_id))));


--
-- Name: services service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_write ON public.services USING (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text])) WITH CHECK (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets ticket_checkin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_checkin ON public.tickets FOR UPDATE USING (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text, 'scanner'::text])) WITH CHECK (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text, 'scanner'::text]));


--
-- Name: ticket_holds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_holds ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets ticket_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_read ON public.tickets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = tickets.order_id) AND ((o.buyer_user_id = auth.uid()) OR public.is_org_member(o.org_id))))));


--
-- Name: ticket_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_transfers ticket_transfers_org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_transfers_org_read ON public.ticket_transfers FOR SELECT USING (public.is_org_member(public.event_org(( SELECT t.event_id
   FROM public.tickets t
  WHERE (t.id = ticket_transfers.ticket_id)))));


--
-- Name: ticket_types ticket_type_org_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_type_org_write ON public.ticket_types USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = ticket_types.event_id) AND public.is_org_member(e.org_id, ARRAY['owner'::text, 'admin'::text, 'staff'::text]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = ticket_types.event_id) AND public.is_org_member(e.org_id, ARRAY['owner'::text, 'admin'::text, 'staff'::text])))));


--
-- Name: ticket_types ticket_type_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_type_public_read ON public.ticket_types FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = ticket_types.event_id) AND ((e.status = 'published'::text) OR public.is_org_member(e.org_id))))));


--
-- Name: ticket_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_maps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_maps ENABLE ROW LEVEL SECURITY;

--
-- Name: venues venue_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_org_all ON public.venues USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id, ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: venues_v2 venue_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_org_all ON public.venues_v2 USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id, ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: venue_seats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_seats ENABLE ROW LEVEL SECURITY;

--
-- Name: venues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

--
-- Name: venues_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venues_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist waitlist_org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waitlist_org_read ON public.waitlist FOR SELECT USING (public.is_org_member(public.event_org(event_id)));


--
-- Name: waitlist waitlist_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waitlist_org_update ON public.waitlist FOR UPDATE USING (public.is_org_member(public.event_org(event_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: waitlist waitlist_public_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waitlist_public_insert ON public.waitlist FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = waitlist.event_id) AND (e.status = 'published'::text)))));


--
-- Name: zones zone_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY zone_read ON public.zones FOR SELECT USING (true);


--
-- Name: zones zone_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY zone_write ON public.zones USING (public.is_org_member(public.map_org(map_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text])) WITH CHECK (public.is_org_member(public.map_org(map_id), ARRAY['owner'::text, 'admin'::text, 'staff'::text]));


--
-- Name: zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION admit_all_queues(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admit_all_queues() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admit_all_queues() TO authenticated;
GRANT ALL ON FUNCTION public.admit_all_queues() TO service_role;


--
-- Name: FUNCTION attach_map_to_event(p_event uuid, p_map uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.attach_map_to_event(p_event uuid, p_map uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.attach_map_to_event(p_event uuid, p_map uuid) TO authenticated;
GRANT ALL ON FUNCTION public.attach_map_to_event(p_event uuid, p_map uuid) TO service_role;


--
-- Name: FUNCTION available_stock(p_ticket_type uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.available_stock(p_ticket_type uuid) TO anon;
GRANT ALL ON FUNCTION public.available_stock(p_ticket_type uuid) TO authenticated;
GRANT ALL ON FUNCTION public.available_stock(p_ticket_type uuid) TO service_role;


--
-- Name: FUNCTION bump_campaign_metric(p_campaign uuid, p_field text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bump_campaign_metric(p_campaign uuid, p_field text) TO anon;
GRANT ALL ON FUNCTION public.bump_campaign_metric(p_campaign uuid, p_field text) TO authenticated;
GRANT ALL ON FUNCTION public.bump_campaign_metric(p_campaign uuid, p_field text) TO service_role;


--
-- Name: FUNCTION bump_staff_activity(p_staff uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bump_staff_activity(p_staff uuid) TO anon;
GRANT ALL ON FUNCTION public.bump_staff_activity(p_staff uuid) TO authenticated;
GRANT ALL ON FUNCTION public.bump_staff_activity(p_staff uuid) TO service_role;


--
-- Name: FUNCTION buy_listing(p_listing uuid, p_buyer_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.buy_listing(p_listing uuid, p_buyer_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.buy_listing(p_listing uuid, p_buyer_email text) TO authenticated;
GRANT ALL ON FUNCTION public.buy_listing(p_listing uuid, p_buyer_email text) TO service_role;


--
-- Name: FUNCTION buyer_ticket_count(p_event uuid, p_email text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.buyer_ticket_count(p_event uuid, p_email text) TO anon;
GRANT ALL ON FUNCTION public.buyer_ticket_count(p_event uuid, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.buyer_ticket_count(p_event uuid, p_email text) TO service_role;


--
-- Name: FUNCTION cancel_event(p_event uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_event(p_event uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_event(p_event uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_event(p_event uuid) TO service_role;


--
-- Name: FUNCTION cancel_listing(p_listing uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cancel_listing(p_listing uuid) TO anon;
GRANT ALL ON FUNCTION public.cancel_listing(p_listing uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_listing(p_listing uuid) TO service_role;


--
-- Name: FUNCTION check_in_ticket(p_qr_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_in_ticket(p_qr_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_in_ticket(p_qr_token text) TO service_role;


--
-- Name: FUNCTION cleanup_expired_holds(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_expired_holds() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_expired_holds() TO service_role;


--
-- Name: FUNCTION cleanup_rate_hits(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_rate_hits() TO anon;
GRANT ALL ON FUNCTION public.cleanup_rate_hits() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_rate_hits() TO service_role;


--
-- Name: FUNCTION confirm_order_paid(p_order_id uuid, p_payment_intent_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_order_paid(p_order_id uuid, p_payment_intent_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_order_paid(p_order_id uuid, p_payment_intent_id text) TO service_role;


--
-- Name: FUNCTION confirm_season_pass(p_order uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_season_pass(p_order uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_season_pass(p_order uuid) TO service_role;


--
-- Name: FUNCTION consume_presale_code(p_event uuid, p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_presale_code(p_event uuid, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_presale_code(p_event uuid, p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.consume_presale_code(p_event uuid, p_code text) TO service_role;


--
-- Name: FUNCTION create_hold(p_ticket_type uuid, p_quantity integer, p_session_id text, p_ttl_minutes integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_hold(p_ticket_type uuid, p_quantity integer, p_session_id text, p_ttl_minutes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_hold(p_ticket_type uuid, p_quantity integer, p_session_id text, p_ttl_minutes integer) TO service_role;


--
-- Name: FUNCTION create_organization(p_name text, p_slug text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_organization(p_name text, p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_organization(p_name text, p_slug text) TO authenticated;
GRANT ALL ON FUNCTION public.create_organization(p_name text, p_slug text) TO service_role;


--
-- Name: FUNCTION delete_order(p_order_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_order(p_order_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_order(p_order_id uuid) TO service_role;


--
-- Name: FUNCTION delete_venue(p_venue uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_venue(p_venue uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_venue(p_venue uuid) TO service_role;


--
-- Name: FUNCTION delete_zone(p_zone uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_zone(p_zone uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_zone(p_zone uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_zone(p_zone uuid) TO service_role;


--
-- Name: FUNCTION email_optout(p_email text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.email_optout(p_email text) TO anon;
GRANT ALL ON FUNCTION public.email_optout(p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.email_optout(p_email text) TO service_role;


--
-- Name: FUNCTION event_org(target_event uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.event_org(target_event uuid) TO anon;
GRANT ALL ON FUNCTION public.event_org(target_event uuid) TO authenticated;
GRANT ALL ON FUNCTION public.event_org(target_event uuid) TO service_role;


--
-- Name: FUNCTION events_search_trigger(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.events_search_trigger() TO anon;
GRANT ALL ON FUNCTION public.events_search_trigger() TO authenticated;
GRANT ALL ON FUNCTION public.events_search_trigger() TO service_role;


--
-- Name: FUNCTION generate_seats(p_ticket_type uuid, p_section text, p_rows integer, p_cols integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.generate_seats(p_ticket_type uuid, p_section text, p_rows integer, p_cols integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_seats(p_ticket_type uuid, p_section text, p_rows integer, p_cols integer) TO authenticated;
GRANT ALL ON FUNCTION public.generate_seats(p_ticket_type uuid, p_section text, p_rows integer, p_cols integer) TO service_role;


--
-- Name: FUNCTION generate_zone_seats(p_zone uuid, p_rows integer, p_cols integer, p_row_start text, p_seat_start integer, p_origin_x numeric, p_origin_y numeric, p_dx numeric, p_dy numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.generate_zone_seats(p_zone uuid, p_rows integer, p_cols integer, p_row_start text, p_seat_start integer, p_origin_x numeric, p_origin_y numeric, p_dx numeric, p_dy numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_zone_seats(p_zone uuid, p_rows integer, p_cols integer, p_row_start text, p_seat_start integer, p_origin_x numeric, p_origin_y numeric, p_dx numeric, p_dy numeric) TO authenticated;
GRANT ALL ON FUNCTION public.generate_zone_seats(p_zone uuid, p_rows integer, p_cols integer, p_row_start text, p_seat_start integer, p_origin_x numeric, p_origin_y numeric, p_dx numeric, p_dy numeric) TO service_role;


--
-- Name: FUNCTION hit_rate_limit(p_key text, p_max integer, p_window_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer) TO authenticated;
GRANT ALL ON FUNCTION public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer) TO service_role;
GRANT ALL ON FUNCTION public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer) TO anon;


--
-- Name: FUNCTION hold_event_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hold_event_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes integer) TO anon;
GRANT ALL ON FUNCTION public.hold_event_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes integer) TO authenticated;
GRANT ALL ON FUNCTION public.hold_event_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes integer) TO service_role;


--
-- Name: FUNCTION hold_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hold_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes integer) TO anon;
GRANT ALL ON FUNCTION public.hold_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes integer) TO authenticated;
GRANT ALL ON FUNCTION public.hold_seats(p_seat_ids uuid[], p_session text, p_ttl_minutes integer) TO service_role;


--
-- Name: FUNCTION is_org_member(target_org uuid, min_roles text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_org_member(target_org uuid, min_roles text[]) TO anon;
GRANT ALL ON FUNCTION public.is_org_member(target_org uuid, min_roles text[]) TO authenticated;
GRANT ALL ON FUNCTION public.is_org_member(target_org uuid, min_roles text[]) TO service_role;


--
-- Name: FUNCTION is_queue_admitted(p_event uuid, p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_queue_admitted(p_event uuid, p_token text) TO anon;
GRANT ALL ON FUNCTION public.is_queue_admitted(p_event uuid, p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.is_queue_admitted(p_event uuid, p_token text) TO service_role;


--
-- Name: FUNCTION join_queue(p_event uuid, p_token text, p_identity text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.join_queue(p_event uuid, p_token text, p_identity text) TO anon;
GRANT ALL ON FUNCTION public.join_queue(p_event uuid, p_token text, p_identity text) TO authenticated;
GRANT ALL ON FUNCTION public.join_queue(p_event uuid, p_token text, p_identity text) TO service_role;


--
-- Name: FUNCTION list_ticket(p_token text, p_price_cents integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.list_ticket(p_token text, p_price_cents integer) TO anon;
GRANT ALL ON FUNCTION public.list_ticket(p_token text, p_price_cents integer) TO authenticated;
GRANT ALL ON FUNCTION public.list_ticket(p_token text, p_price_cents integer) TO service_role;


--
-- Name: FUNCTION map_org(p_map uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.map_org(p_map uuid) TO anon;
GRANT ALL ON FUNCTION public.map_org(p_map uuid) TO authenticated;
GRANT ALL ON FUNCTION public.map_org(p_map uuid) TO service_role;


--
-- Name: FUNCTION mark_queue_used(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_queue_used(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_queue_used(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.mark_queue_used(p_token text) TO service_role;


--
-- Name: FUNCTION publish_map(p_map uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.publish_map(p_map uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_map(p_map uuid) TO authenticated;
GRANT ALL ON FUNCTION public.publish_map(p_map uuid) TO service_role;


--
-- Name: FUNCTION queue_status(p_event uuid, p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.queue_status(p_event uuid, p_token text) TO anon;
GRANT ALL ON FUNCTION public.queue_status(p_event uuid, p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.queue_status(p_event uuid, p_token text) TO service_role;


--
-- Name: FUNCTION recalibrate_map(p_map uuid, p_factor numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.recalibrate_map(p_map uuid, p_factor numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recalibrate_map(p_map uuid, p_factor numeric) TO authenticated;
GRANT ALL ON FUNCTION public.recalibrate_map(p_map uuid, p_factor numeric) TO service_role;


--
-- Name: FUNCTION refund_order(p_order_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refund_order(p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refund_order(p_order_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.refund_order(p_order_id uuid) TO service_role;


--
-- Name: FUNCTION register_presale(p_event uuid, p_email text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.register_presale(p_event uuid, p_email text) TO anon;
GRANT ALL ON FUNCTION public.register_presale(p_event uuid, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.register_presale(p_event uuid, p_email text) TO service_role;


--
-- Name: FUNCTION release_expired_event_seats(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_expired_event_seats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_expired_event_seats() TO authenticated;
GRANT ALL ON FUNCTION public.release_expired_event_seats() TO service_role;


--
-- Name: FUNCTION release_expired_seats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.release_expired_seats() TO anon;
GRANT ALL ON FUNCTION public.release_expired_seats() TO authenticated;
GRANT ALL ON FUNCTION public.release_expired_seats() TO service_role;


--
-- Name: FUNCTION release_listing(p_listing uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_listing(p_listing uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_listing(p_listing uuid) TO service_role;


--
-- Name: FUNCTION release_season_pass(p_season uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_season_pass(p_season uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_season_pass(p_season uuid) TO service_role;


--
-- Name: FUNCTION reserve_listing(p_listing uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reserve_listing(p_listing uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reserve_listing(p_listing uuid) TO service_role;


--
-- Name: FUNCTION reserve_season_pass(p_season uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reserve_season_pass(p_season uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reserve_season_pass(p_season uuid) TO service_role;


--
-- Name: FUNCTION run_presale_lottery(p_event uuid, p_count integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_presale_lottery(p_event uuid, p_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_presale_lottery(p_event uuid, p_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.run_presale_lottery(p_event uuid, p_count integer) TO service_role;


--
-- Name: FUNCTION save_zone(p_map uuid, p_name text, p_kind text, p_color text, p_points jsonb, p_ga_capacity integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_zone(p_map uuid, p_name text, p_kind text, p_color text, p_points jsonb, p_ga_capacity integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_zone(p_map uuid, p_name text, p_kind text, p_color text, p_points jsonb, p_ga_capacity integer) TO authenticated;
GRANT ALL ON FUNCTION public.save_zone(p_map uuid, p_name text, p_kind text, p_color text, p_points jsonb, p_ga_capacity integer) TO service_role;


--
-- Name: FUNCTION set_zone_price(p_event uuid, p_zone uuid, p_price integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_zone_price(p_event uuid, p_zone uuid, p_price integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_zone_price(p_event uuid, p_zone uuid, p_price integer) TO authenticated;
GRANT ALL ON FUNCTION public.set_zone_price(p_event uuid, p_zone uuid, p_price integer) TO service_role;


--
-- Name: FUNCTION staff_session(p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.staff_session(p_token text) TO anon;
GRANT ALL ON FUNCTION public.staff_session(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.staff_session(p_token text) TO service_role;


--
-- Name: FUNCTION ticket_brand(p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ticket_brand(p_token text) TO anon;
GRANT ALL ON FUNCTION public.ticket_brand(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.ticket_brand(p_token text) TO service_role;


--
-- Name: FUNCTION ticket_event_info(p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ticket_event_info(p_token text) TO anon;
GRANT ALL ON FUNCTION public.ticket_event_info(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.ticket_event_info(p_token text) TO service_role;


--
-- Name: FUNCTION ticket_rotating_code(p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ticket_rotating_code(p_token text) TO anon;
GRANT ALL ON FUNCTION public.ticket_rotating_code(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.ticket_rotating_code(p_token text) TO service_role;


--
-- Name: FUNCTION transfer_ticket(p_token text, p_to_email text, p_kind text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.transfer_ticket(p_token text, p_to_email text, p_kind text) TO anon;
GRANT ALL ON FUNCTION public.transfer_ticket(p_token text, p_to_email text, p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.transfer_ticket(p_token text, p_to_email text, p_kind text) TO service_role;


--
-- Name: FUNCTION validate_presale_code(p_event uuid, p_code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_presale_code(p_event uuid, p_code text) TO anon;
GRANT ALL ON FUNCTION public.validate_presale_code(p_event uuid, p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.validate_presale_code(p_event uuid, p_code text) TO service_role;


--
-- Name: FUNCTION validate_promo_code(p_event uuid, p_code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_promo_code(p_event uuid, p_code text) TO anon;
GRANT ALL ON FUNCTION public.validate_promo_code(p_event uuid, p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.validate_promo_code(p_event uuid, p_code text) TO service_role;


--
-- Name: FUNCTION verify_rotating_code(p_token text, p_otp text, p_counter bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.verify_rotating_code(p_token text, p_otp text, p_counter bigint) TO anon;
GRANT ALL ON FUNCTION public.verify_rotating_code(p_token text, p_otp text, p_counter bigint) TO authenticated;
GRANT ALL ON FUNCTION public.verify_rotating_code(p_token text, p_otp text, p_counter bigint) TO service_role;


--
-- Name: TABLE attendees; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attendees TO anon;
GRANT ALL ON TABLE public.attendees TO authenticated;
GRANT ALL ON TABLE public.attendees TO service_role;


--
-- Name: TABLE campaign_emails; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campaign_emails TO anon;
GRANT ALL ON TABLE public.campaign_emails TO authenticated;
GRANT ALL ON TABLE public.campaign_emails TO service_role;


--
-- Name: TABLE campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campaigns TO anon;
GRANT ALL ON TABLE public.campaigns TO authenticated;
GRANT ALL ON TABLE public.campaigns TO service_role;


--
-- Name: TABLE checkin_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.checkin_log TO anon;
GRANT ALL ON TABLE public.checkin_log TO authenticated;
GRANT ALL ON TABLE public.checkin_log TO service_role;


--
-- Name: TABLE email_campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_campaigns TO anon;
GRANT ALL ON TABLE public.email_campaigns TO authenticated;
GRANT ALL ON TABLE public.email_campaigns TO service_role;


--
-- Name: TABLE email_optouts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_optouts TO anon;
GRANT ALL ON TABLE public.email_optouts TO authenticated;
GRANT ALL ON TABLE public.email_optouts TO service_role;


--
-- Name: TABLE event_change_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_change_log TO anon;
GRANT ALL ON TABLE public.event_change_log TO authenticated;
GRANT ALL ON TABLE public.event_change_log TO service_role;


--
-- Name: TABLE event_maps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_maps TO anon;
GRANT ALL ON TABLE public.event_maps TO authenticated;
GRANT ALL ON TABLE public.event_maps TO service_role;


--
-- Name: TABLE event_seats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_seats TO anon;
GRANT ALL ON TABLE public.event_seats TO authenticated;
GRANT ALL ON TABLE public.event_seats TO service_role;


--
-- Name: TABLE event_staff; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_staff TO anon;
GRANT ALL ON TABLE public.event_staff TO authenticated;
GRANT ALL ON TABLE public.event_staff TO service_role;


--
-- Name: TABLE event_zone_pricing; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_zone_pricing TO anon;
GRANT ALL ON TABLE public.event_zone_pricing TO authenticated;
GRANT ALL ON TABLE public.event_zone_pricing TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: TABLE leads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leads TO anon;
GRANT ALL ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;


--
-- Name: TABLE listings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.listings TO anon;
GRANT ALL ON TABLE public.listings TO authenticated;
GRANT ALL ON TABLE public.listings TO service_role;


--
-- Name: TABLE notification_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_jobs TO anon;
GRANT ALL ON TABLE public.notification_jobs TO authenticated;
GRANT ALL ON TABLE public.notification_jobs TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_items TO anon;
GRANT ALL ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: TABLE order_services; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_services TO anon;
GRANT ALL ON TABLE public.order_services TO authenticated;
GRANT ALL ON TABLE public.order_services TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE org_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.org_members TO anon;
GRANT ALL ON TABLE public.org_members TO authenticated;
GRANT ALL ON TABLE public.org_members TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organizations TO anon;
GRANT ALL ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: TABLE payouts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payouts TO anon;
GRANT ALL ON TABLE public.payouts TO authenticated;
GRANT ALL ON TABLE public.payouts TO service_role;


--
-- Name: TABLE presale_registrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.presale_registrations TO anon;
GRANT ALL ON TABLE public.presale_registrations TO authenticated;
GRANT ALL ON TABLE public.presale_registrations TO service_role;


--
-- Name: TABLE promo_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promo_codes TO anon;
GRANT ALL ON TABLE public.promo_codes TO authenticated;
GRANT ALL ON TABLE public.promo_codes TO service_role;


--
-- Name: TABLE queue_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.queue_sessions TO anon;
GRANT ALL ON TABLE public.queue_sessions TO authenticated;
GRANT ALL ON TABLE public.queue_sessions TO service_role;


--
-- Name: TABLE rate_hits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_hits TO anon;
GRANT ALL ON TABLE public.rate_hits TO authenticated;
GRANT ALL ON TABLE public.rate_hits TO service_role;


--
-- Name: TABLE resale_payouts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resale_payouts TO anon;
GRANT ALL ON TABLE public.resale_payouts TO authenticated;
GRANT ALL ON TABLE public.resale_payouts TO service_role;


--
-- Name: TABLE rows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rows TO anon;
GRANT ALL ON TABLE public.rows TO authenticated;
GRANT ALL ON TABLE public.rows TO service_role;


--
-- Name: TABLE season_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.season_events TO anon;
GRANT ALL ON TABLE public.season_events TO authenticated;
GRANT ALL ON TABLE public.season_events TO service_role;


--
-- Name: TABLE seasons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.seasons TO anon;
GRANT ALL ON TABLE public.seasons TO authenticated;
GRANT ALL ON TABLE public.seasons TO service_role;


--
-- Name: TABLE seats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.seats TO anon;
GRANT ALL ON TABLE public.seats TO authenticated;
GRANT ALL ON TABLE public.seats TO service_role;


--
-- Name: TABLE seller_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.seller_accounts TO anon;
GRANT ALL ON TABLE public.seller_accounts TO authenticated;
GRANT ALL ON TABLE public.seller_accounts TO service_role;


--
-- Name: TABLE services; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.services TO anon;
GRANT ALL ON TABLE public.services TO authenticated;
GRANT ALL ON TABLE public.services TO service_role;


--
-- Name: TABLE ticket_holds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_holds TO anon;
GRANT ALL ON TABLE public.ticket_holds TO authenticated;
GRANT ALL ON TABLE public.ticket_holds TO service_role;


--
-- Name: TABLE ticket_transfers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_transfers TO anon;
GRANT ALL ON TABLE public.ticket_transfers TO authenticated;
GRANT ALL ON TABLE public.ticket_transfers TO service_role;


--
-- Name: TABLE ticket_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_types TO anon;
GRANT ALL ON TABLE public.ticket_types TO authenticated;
GRANT ALL ON TABLE public.ticket_types TO service_role;


--
-- Name: TABLE tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tickets TO anon;
GRANT ALL ON TABLE public.tickets TO authenticated;
GRANT ALL ON TABLE public.tickets TO service_role;


--
-- Name: TABLE venue_maps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venue_maps TO anon;
GRANT ALL ON TABLE public.venue_maps TO authenticated;
GRANT ALL ON TABLE public.venue_maps TO service_role;


--
-- Name: TABLE venue_seats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venue_seats TO anon;
GRANT ALL ON TABLE public.venue_seats TO authenticated;
GRANT ALL ON TABLE public.venue_seats TO service_role;


--
-- Name: TABLE venue_seats_geo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venue_seats_geo TO anon;
GRANT ALL ON TABLE public.venue_seats_geo TO authenticated;
GRANT ALL ON TABLE public.venue_seats_geo TO service_role;


--
-- Name: TABLE venues; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venues TO anon;
GRANT ALL ON TABLE public.venues TO authenticated;
GRANT ALL ON TABLE public.venues TO service_role;


--
-- Name: TABLE venues_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venues_v2 TO anon;
GRANT ALL ON TABLE public.venues_v2 TO authenticated;
GRANT ALL ON TABLE public.venues_v2 TO service_role;


--
-- Name: TABLE waitlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.waitlist TO anon;
GRANT ALL ON TABLE public.waitlist TO authenticated;
GRANT ALL ON TABLE public.waitlist TO service_role;


--
-- Name: TABLE zone_availability; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zone_availability TO anon;
GRANT ALL ON TABLE public.zone_availability TO authenticated;
GRANT ALL ON TABLE public.zone_availability TO service_role;


--
-- Name: TABLE zones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zones TO anon;
GRANT ALL ON TABLE public.zones TO authenticated;
GRANT ALL ON TABLE public.zones TO service_role;


--
-- Name: TABLE zones_geo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zones_geo TO anon;
GRANT ALL ON TABLE public.zones_geo TO authenticated;
GRANT ALL ON TABLE public.zones_geo TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--

\unrestrict 8khKozexFndahtTdQx9iucwcN2hXZyEhURdaQDgWCPNq6H0NeIltrOMvOa6jyKL


-- ===== Storage buckets (fuera del schema public) =====
insert into storage.buckets (id, name, public) values
  ('event-covers','event-covers',true),
  ('org-logos','org-logos',true),
  ('venue-plans','venue-plans',true)
on conflict (id) do nothing;

-- ===== Storage policies (reconstruidas de prod) =====
create policy "event_covers_public_read" on storage.objects for select using (bucket_id='event-covers');
create policy "event_covers_member_write" on storage.objects for insert with check (bucket_id='event-covers' and public.is_org_member(public.event_org(((storage.foldername(name))[1])::uuid)));
create policy "event_covers_member_update" on storage.objects for update using (bucket_id='event-covers' and public.is_org_member(public.event_org(((storage.foldername(name))[1])::uuid)));
create policy "event_covers_member_delete" on storage.objects for delete using (bucket_id='event-covers' and public.is_org_member(public.event_org(((storage.foldername(name))[1])::uuid)));
create policy "org_logos_public_read" on storage.objects for select using (bucket_id='org-logos');
create policy "org_logos_member_write" on storage.objects for insert with check (bucket_id='org-logos' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "org_logos_member_update" on storage.objects for update using (bucket_id='org-logos' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "org_logos_member_delete" on storage.objects for delete using (bucket_id='org-logos' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "venue_plans_public_read" on storage.objects for select using (bucket_id='venue-plans');
create policy "venue_plans_auth_insert" on storage.objects for insert to authenticated with check (bucket_id='venue-plans');
create policy "venue_plans_auth_update" on storage.objects for update to authenticated using (bucket_id='venue-plans');

-- ===== Cron jobs =====
select cron.schedule('cleanup-expired-holds','* * * * *', $$ select public.cleanup_expired_holds(); $$);
select cron.schedule('cleanup-rate-hits','*/5 * * * *', $$ select public.cleanup_rate_hits(); $$);
select cron.schedule('queue-admit','15 seconds', $$ select public.admit_all_queues(); $$);
select cron.schedule('release-expired-event-seats','* * * * *', $$ select public.release_expired_event_seats(); $$);
select cron.schedule('release-expired-seats','* * * * *', $$ select public.release_expired_seats(); $$);
