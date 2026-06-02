-- ============================================================================
-- Ticketera — Lógica de inventario atómico + emisión de boletos
-- SECURITY DEFINER con search_path = public, extensions (gen_random_bytes/uuid
-- viven en extensions). Estas funciones son el núcleo anti-overselling.
-- ============================================================================

-- Stock realmente disponible = total - vendidos - holds activos.
create or replace function public.available_stock(p_ticket_type uuid)
returns int
language sql
stable
security definer
set search_path = public, extensions
as $$
  select tt.quantity_total
       - tt.quantity_sold
       - coalesce((select sum(h.quantity) from public.ticket_holds h
                   where h.ticket_type_id = tt.id and h.expires_at > now()), 0)
  from public.ticket_types tt
  where tt.id = p_ticket_type;
$$;

-- Crea un hold temporal si hay stock. Bloquea la fila del ticket_type
-- (FOR UPDATE) para serializar holds concurrentes → cero races.
create or replace function public.create_hold(
  p_ticket_type uuid,
  p_quantity    int,
  p_session_id  text,
  p_ttl_minutes int default 10
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_available int;
  v_max       int;
  v_hold_id   uuid;
begin
  -- Lock pesimista de la fila: cualquier otro create_hold del mismo tipo espera.
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

-- Confirma una orden pagada (llamada desde el webhook de Stripe con service role).
-- Idempotente: si ya está 'paid', no hace nada. Mueve hold→sold con guardia
-- atómica, emite 1 ticket por unidad con QR opaco, borra los holds de la orden.
create or replace function public.confirm_order_paid(
  p_order_id            uuid,
  p_payment_intent_id   text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_status text;
  item     record;
  v_updated int;
  i        int;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'orden % no existe', p_order_id using errcode = 'no_data_found';
  end if;
  if v_status = 'paid' then
    return;  -- ya confirmada (webhook duplicado) → idempotente
  end if;

  -- Consume stock con guardia atómica por cada línea de la orden.
  for item in
    select ticket_type_id, quantity from public.order_items where order_id = p_order_id
  loop
    update public.ticket_types
      set quantity_sold = quantity_sold + item.quantity
      where id = item.ticket_type_id
        and quantity_sold + item.quantity <= quantity_total;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'overselling evitado en ticket_type %', item.ticket_type_id using errcode = 'check_violation';
    end if;

    -- Emite un boleto (1 QR) por cada unidad.
    for i in 1..item.quantity loop
      insert into public.tickets (order_id, ticket_type_id, event_id, qr_token)
      select p_order_id, item.ticket_type_id, o.event_id,
             encode(extensions.gen_random_bytes(24), 'hex')
      from public.orders o where o.id = p_order_id;
    end loop;
  end loop;

  -- Libera los holds de esta orden y marca pagada.
  delete from public.ticket_holds where order_id = p_order_id;

  update public.orders
    set status = 'paid',
        paid_at = now(),
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id)
    where id = p_order_id;
end;
$$;

-- Check-in atómico: solo válido→checked_in una sola vez (doble-scan rechazado).
create or replace function public.check_in_ticket(p_qr_token text)
returns table (ticket_id uuid, event_id uuid, ok boolean, reason text)
language plpgsql
security definer
set search_path = public, extensions
as $$
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

-- Limpieza de holds expirados (programada con pg_cron). Devuelve stock solo.
create or replace function public.cleanup_expired_holds()
returns int
language sql
security definer
set search_path = public, extensions
as $$
  with deleted as (
    delete from public.ticket_holds where expires_at <= now() returning 1
  ) select count(*)::int from deleted;
$$;

-- search_vector para FTS en eventos.
create or replace function public.events_search_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.city,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.category,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.description,'')), 'C');
  return new;
end;
$$;

create trigger events_search_update
  before insert or update of title, city, category, description on public.events
  for each row execute function public.events_search_trigger();

-- ---------- pg_cron: limpiar holds cada minuto ----------
-- (Se programa en la migración 0004; pg_cron crea su propio schema `cron`.)
