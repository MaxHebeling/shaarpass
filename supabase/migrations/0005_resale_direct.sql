-- Reventa → cargos directos (el vendedor conecta ANTES de publicar)
-- ================================================================
-- Antes: el comprador pagaba a la PLATAFORMA y esta transfería al vendedor
-- cuando conectaba (resale_payouts + processPayout). Ahora el comprador paga
-- DIRECTO a la cuenta Connect del vendedor, así que el vendedor debe estar
-- conectado y habilitado para cobrar ANTES de publicar la reventa.

begin;

-- Estado de cobro de la cuenta del vendedor (cargo directo requiere charges_enabled).
alter table public.seller_accounts add column if not exists charges_enabled boolean not null default false;

-- list_ticket: exige que el vendedor tenga cuenta conectada habilitada para cobrar.
create or replace function public.list_ticket(p_token text, p_price_cents integer) returns uuid
    language plpgsql security definer
    set search_path to 'public', 'extensions'
as $$
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
  -- Cargo directo: el vendedor debe poder cobrar en su propia cuenta Connect.
  if not exists (select 1 from public.seller_accounts sa where sa.email = v_from and sa.charges_enabled) then
    raise exception 'SELLER_NOT_CONNECTED' using errcode='check_violation';
  end if;
  insert into public.listings (ticket_id, event_id, seller_email, price_cents) values (v_ticket, v_event, v_from, p_price_cents) returning id into v_listing;
  return v_listing;
end $$;

-- buy_listing: ya NO registra resale_payouts (el dinero llegó directo al vendedor).
create or replace function public.buy_listing(p_listing uuid, p_buyer_email text) returns text
    language plpgsql security definer
    set search_path to 'public', 'extensions'
as $$
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
  -- (sin resale_payouts: cargo directo → el dinero ya está en la cuenta del vendedor)
  return v_newtok;
end $$;

commit;
