-- ============================================================================
-- 0013 · Módulo de Gestión de Asistentes, Cobertura Pastoral y Protocolo
-- ============================================================================
-- Ampliación ADITIVA y AISLADA por tenant (organización):
--   * No altera columnas, constraints, funciones ni políticas existentes.
--   * Todo vive en tablas nuevas `protocol_*` + `org_features`.
--   * Solo una organización con el feature `protocol` puede tener datos aquí
--     (lo garantizan triggers); solo se habilita, por slug, a Fuente de Vida.
--   * Cada evento se activa por separado (protocol_event_settings.enabled).
--   * Única escritura sobre tablas compartidas: al identificar al asistente de un
--     boleto de un evento habilitado, se refleja su nombre en `attendees` y se
--     enlaza `tickets.attendee_id` (columna ya existente) para que el check-in y
--     el CSV actuales muestren el nombre real sin cambiar su código.
--
-- Rollback: ver supabase/rollback/0013_protocol_module_down.sql
-- ============================================================================

-- ─── 1) Feature flags por organización ──────────────────────────────────────
create table if not exists public.org_features (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  feature    text not null check (feature ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (org_id, feature)
);
alter table public.org_features enable row level security;
create policy org_features_member_read on public.org_features for select
  using (public.is_org_member(org_id));
revoke all on table public.org_features from anon, authenticated;
grant select on table public.org_features to authenticated;
grant all on table public.org_features to service_role;

create or replace function public.org_has_feature(p_org uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_features f
                 where f.org_id = p_org and f.feature = p_feature and f.enabled);
$$;
revoke all on function public.org_has_feature(uuid, text) from public;
grant execute on function public.org_has_feature(uuid, text) to authenticated, service_role;

-- ─── 2) Configuración del módulo por evento ─────────────────────────────────
create table if not exists public.protocol_event_settings (
  event_id            uuid primary key references public.events(id) on delete cascade,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  enabled             boolean not null default false,
  companions_enabled  boolean not null default true,
  coverage_enabled    boolean not null default true,
  coverage_leader     text,                          -- p. ej. "Jorge Pompa" (texto de la pregunta)
  meals_enabled       boolean not null default false,
  tables_enabled      boolean not null default false,
  guests_enabled      boolean not null default true,
  edit_deadline       timestamptz,                   -- fecha límite de cambios del comprador
  lock_after_checkin  boolean not null default true, -- tras el check-in solo un admin edita
  updated_by          uuid,
  updated_at          timestamptz not null default now()
);

-- ─── 3) Acceso del comprador (enlace seguro post-pago) ──────────────────────
create table if not exists public.protocol_orders (
  order_id     uuid primary key references public.orders(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  event_id     uuid not null references public.events(id) on delete cascade,
  access_token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  accompanied  text check (accompanied in ('yes','no','tbd')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── 4) Asistentes (uno por boleto) + invitados especiales sin compra ───────
create table if not exists public.protocol_people (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  event_id             uuid not null references public.events(id) on delete cascade,
  kind                 text not null check (kind in ('ticket','guest')),
  ticket_id            uuid unique references public.tickets(id) on delete set null,
  order_id             uuid references public.orders(id) on delete set null,
  full_name            text check (full_name is null or char_length(full_name) between 1 and 160),
  email                text check (email is null or char_length(email) <= 200),
  phone                text check (phone is null or char_length(phone) <= 40),
  city                 text check (city is null or char_length(city) <= 120),
  category             text check (category in ('holder','spouse','child','leader','collaborator','guest','other')),
  relation             text check (relation is null or char_length(relation) <= 120),
  is_pastor            boolean,
  coverage_claim       text check (coverage_claim in ('yes','no','org_confirm')),
  coverage_status      text not null default 'not_applicable'
                       check (coverage_status in ('pending','confirmed','not_confirmed','not_applicable')),
  coverage_reviewed_by uuid,
  coverage_reviewed_at timestamptz,
  coverage_note        text check (coverage_note is null or char_length(coverage_note) <= 500),
  confirmation_status  text not null default 'pending' check (confirmation_status in ('pending','confirmed','declined')),
  access_category      text check (access_category is null or char_length(access_category) <= 60),
  badge                text check (badge is null or char_length(badge) <= 60),
  admin_notes          text check (admin_notes is null or char_length(admin_notes) <= 1000),
  updated_by           uuid,
  updated_by_kind      text not null default 'system' check (updated_by_kind in ('admin','buyer','system','staff')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Un invitado especial nunca ocupa un boleto (el boleto puede quedar null si se borra).
  constraint protocol_people_ticket_kind check (kind = 'ticket' or ticket_id is null),
  -- La validación administrativa de cobertura exige revisor.
  constraint protocol_people_coverage_review check (
    coverage_status not in ('confirmed','not_confirmed') or coverage_reviewed_by is not null)
);
create index if not exists protocol_people_event_idx on public.protocol_people (event_id);
create index if not exists protocol_people_order_idx on public.protocol_people (order_id);

-- ─── 5) Comidas e invitaciones ──────────────────────────────────────────────
create table if not exists public.protocol_meal_sessions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  event_id   uuid not null references public.events(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  starts_at  timestamptz,
  capacity   integer check (capacity is null or capacity > 0),
  notes      text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists protocol_meal_sessions_event_idx on public.protocol_meal_sessions (event_id);

create table if not exists public.protocol_meal_invitations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  event_id           uuid not null references public.events(id) on delete cascade,
  session_id         uuid not null references public.protocol_meal_sessions(id) on delete cascade,
  person_id          uuid not null references public.protocol_people(id) on delete cascade,
  invitation_type    text check (invitation_type is null or char_length(invitation_type) <= 60),
  status             text not null default 'pending' check (status in ('pending','confirmed','declined')),
  companions_allowed integer not null default 0 check (companions_allowed between 0 and 20),
  badge              text check (badge is null or char_length(badge) <= 60),
  notes              text check (notes is null or char_length(notes) <= 500),
  updated_by         uuid,
  updated_by_kind    text not null default 'admin' check (updated_by_kind in ('admin','buyer','system','staff')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Una persona = una invitación por comida: imposible contarla dos veces.
  constraint protocol_meal_invitations_unique unique (session_id, person_id)
);
create index if not exists protocol_meal_inv_event_idx on public.protocol_meal_invitations (event_id);

-- ─── 6) Mesas y asignaciones ────────────────────────────────────────────────
create table if not exists public.protocol_tables (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  event_id       uuid not null references public.events(id) on delete cascade,
  session_id     uuid references public.protocol_meal_sessions(id) on delete set null,
  name           text not null check (char_length(name) between 1 and 80),
  capacity       integer not null check (capacity between 1 and 200),
  reserved_seats integer not null default 0 check (reserved_seats >= 0),
  reserved_for   text check (reserved_for is null or char_length(reserved_for) <= 120),
  sort           integer not null default 0,
  created_at     timestamptz not null default now(),
  constraint protocol_tables_reserved_le_capacity check (reserved_seats <= capacity)
);
create index if not exists protocol_tables_event_idx on public.protocol_tables (event_id);

create table if not exists public.protocol_table_assignments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  table_id        uuid not null references public.protocol_tables(id) on delete cascade,
  person_id       uuid not null references public.protocol_people(id) on delete cascade,
  seat_label      text check (seat_label is null or char_length(seat_label) <= 20),
  over_capacity   boolean not null default false,   -- autorizado explícitamente por un admin
  updated_by      uuid,
  updated_by_kind text not null default 'admin' check (updated_by_kind in ('admin','buyer','system','staff')),
  created_at      timestamptz not null default now(),
  -- Una persona ocupa a lo sumo un lugar por evento.
  constraint protocol_table_assignments_person_unique unique (event_id, person_id)
);
create index if not exists protocol_table_assign_table_idx on public.protocol_table_assignments (table_id);

-- ─── 7) Bitácora (solo inserción) ───────────────────────────────────────────
create table if not exists public.protocol_audit_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null,
  event_id   uuid not null,
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  actor_kind text,
  actor_id   uuid,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
create index if not exists protocol_audit_event_idx on public.protocol_audit_log (event_id, at desc);
create index if not exists protocol_audit_entity_idx on public.protocol_audit_log (entity_id);

-- ============================================================================
-- Guardas de integridad y aislamiento
-- ============================================================================

-- El org_id de cada fila DEBE ser el dueño real del evento y tener el feature.
-- Así ninguna fila de protocolo puede existir para otro tenant ni cruzar tenants.
create or replace function public.protocol_guard_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.events where id = new.event_id;
  if v_org is null then raise exception 'evento inexistente' using errcode = 'foreign_key_violation'; end if;
  if new.org_id is distinct from v_org then
    raise exception 'org_id no coincide con el evento' using errcode = 'check_violation';
  end if;
  if not public.org_has_feature(v_org, 'protocol') then
    raise exception 'módulo de protocolo no habilitado para esta organización' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and (new.event_id is distinct from old.event_id or new.org_id is distinct from old.org_id) then
    raise exception 'no se puede mover un registro de evento u organización' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Coherencia de asistentes: boleto↔evento↔orden y reglas de cobertura.
create or replace function public.protocol_people_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t record;
begin
  if new.ticket_id is not null then
    select event_id, order_id into v_t from public.tickets where id = new.ticket_id;
    if v_t.event_id is distinct from new.event_id then
      raise exception 'el boleto no pertenece a este evento' using errcode = 'check_violation';
    end if;
    new.order_id := v_t.order_id;
    new.kind := 'ticket';
  elsif tg_op = 'INSERT' then
    new.kind := coalesce(new.kind, 'guest');
  end if;

  new.full_name := nullif(btrim(new.full_name), '');
  -- Ser pastor ≠ estar bajo cobertura. Declararlo solo deja la cobertura "pendiente".
  if new.is_pastor is not true or new.coverage_claim is null or new.coverage_claim = 'no' then
    new.coverage_status := 'not_applicable';
    new.coverage_reviewed_by := null; new.coverage_reviewed_at := null;
  elsif new.coverage_status = 'not_applicable' then
    new.coverage_status := 'pending';
  end if;
  -- Solo un revisor (admin) puede fijar confirmed/not_confirmed: un cambio de estado
  -- de validación exige que el revisor haya cambiado en la misma escritura.
  if new.coverage_status in ('confirmed','not_confirmed')
     and (tg_op = 'INSERT' or new.coverage_status is distinct from old.coverage_status)
     and (new.coverage_reviewed_by is null or new.updated_by_kind <> 'admin') then
    raise exception 'solo un administrativo autorizado valida la cobertura' using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Invitaciones/mesas: la persona, comida y mesa deben ser del mismo evento.
create or replace function public.protocol_links_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ev uuid;
begin
  select event_id into v_ev from public.protocol_people where id = new.person_id;
  if v_ev is distinct from new.event_id then
    raise exception 'la persona no pertenece a este evento' using errcode = 'check_violation';
  end if;
  if tg_table_name = 'protocol_meal_invitations' then
    select event_id into v_ev from public.protocol_meal_sessions where id = new.session_id;
    if v_ev is distinct from new.event_id then raise exception 'comida de otro evento' using errcode = 'check_violation'; end if;
    new.updated_at := now();
  elsif tg_table_name = 'protocol_table_assignments' then
    select event_id into v_ev from public.protocol_tables where id = new.table_id;
    if v_ev is distinct from new.event_id then raise exception 'mesa de otro evento' using errcode = 'check_violation'; end if;
  end if;
  return new;
end $$;

-- Mesas: la comida (si se indica) debe ser del mismo evento.
create or replace function public.protocol_tables_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ev uuid;
begin
  if new.session_id is not null then
    select event_id into v_ev from public.protocol_meal_sessions where id = new.session_id;
    if v_ev is distinct from new.event_id then raise exception 'comida de otro evento' using errcode = 'check_violation'; end if;
  end if;
  return new;
end $$;

-- Refleja el nombre del asistente en `attendees` (tabla existente) y enlaza el
-- boleto, para que el check-in/CSV existentes muestren a la persona real.
create or replace function public.protocol_mirror_attendee()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_att uuid;
begin
  if new.ticket_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.full_name is not distinct from old.full_name
     and new.email is not distinct from old.email and new.ticket_id is not distinct from old.ticket_id then
    return new;
  end if;
  select attendee_id into v_att from public.tickets where id = new.ticket_id;
  if v_att is null then
    if new.full_name is null then return new; end if;
    insert into public.attendees (order_id, first_name, last_name, email)
    values (new.order_id, new.full_name, null, new.email) returning id into v_att;
    update public.tickets set attendee_id = v_att where id = new.ticket_id;
  else
    -- Conserva el correo existente (p. ej. de una transferencia) si no se da otro.
    update public.attendees set first_name = new.full_name, last_name = null,
           email = coalesce(new.email, email)
     where id = v_att;
  end if;
  return new;
end $$;

-- Bitácora automática de altas, cambios y bajas.
create or replace function public.protocol_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb; o jsonb;
begin
  r := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  o := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  if tg_op = 'UPDATE' and (r - 'updated_at') = (o - 'updated_at') then return new; end if;
  insert into public.protocol_audit_log (org_id, event_id, entity, entity_id, action, actor_kind, actor_id, before, after)
  values (coalesce(r->>'org_id', o->>'org_id')::uuid, coalesce(r->>'event_id', o->>'event_id')::uuid,
          tg_table_name, coalesce(r->>'id', o->>'id', r->>'order_id', o->>'order_id', r->>'event_id')::uuid,
          lower(tg_op), coalesce(r->>'updated_by_kind', o->>'updated_by_kind'),
          coalesce(r->>'updated_by', o->>'updated_by')::uuid, o, r);
  return coalesce(new, old);
end $$;

-- Triggers
create trigger protocol_settings_scope before insert or update on public.protocol_event_settings
  for each row execute function public.protocol_guard_scope();
create trigger protocol_orders_scope before insert or update on public.protocol_orders
  for each row execute function public.protocol_guard_scope();
create trigger protocol_people_scope before insert or update on public.protocol_people
  for each row execute function public.protocol_guard_scope();
create trigger protocol_people_rules before insert or update on public.protocol_people
  for each row execute function public.protocol_people_rules();
create trigger protocol_people_mirror after insert or update on public.protocol_people
  for each row execute function public.protocol_mirror_attendee();
create trigger protocol_meal_sessions_scope before insert or update on public.protocol_meal_sessions
  for each row execute function public.protocol_guard_scope();
create trigger protocol_meal_inv_scope before insert or update on public.protocol_meal_invitations
  for each row execute function public.protocol_guard_scope();
create trigger protocol_meal_inv_links before insert or update on public.protocol_meal_invitations
  for each row execute function public.protocol_links_rules();
create trigger protocol_tables_scope before insert or update on public.protocol_tables
  for each row execute function public.protocol_guard_scope();
create trigger protocol_tables_rules before insert or update on public.protocol_tables
  for each row execute function public.protocol_tables_rules();
create trigger protocol_table_assign_scope before insert or update on public.protocol_table_assignments
  for each row execute function public.protocol_guard_scope();
create trigger protocol_table_assign_links before insert or update on public.protocol_table_assignments
  for each row execute function public.protocol_links_rules();

create trigger protocol_people_audit after insert or update or delete on public.protocol_people
  for each row execute function public.protocol_audit();
create trigger protocol_meal_inv_audit after insert or update or delete on public.protocol_meal_invitations
  for each row execute function public.protocol_audit();
create trigger protocol_table_assign_audit after insert or update or delete on public.protocol_table_assignments
  for each row execute function public.protocol_audit();
create trigger protocol_settings_audit after insert or update on public.protocol_event_settings
  for each row execute function public.protocol_audit();

-- ============================================================================
-- Operaciones (solo service_role: el servidor resuelve tenant y permisos antes)
-- ============================================================================

-- ¿El módulo está activo para el evento? (feature de la org + switch del evento)
create or replace function public.protocol_enabled_for_event(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.protocol_event_settings s
    join public.events e on e.id = s.event_id
    where s.event_id = p_event and s.enabled and s.org_id = e.org_id
      and public.org_has_feature(e.org_id, 'protocol'));
$$;

-- Materializa (idempotente) el acceso del comprador y un registro de asistente por
-- boleto activo de una orden PAGADA. Repetirlo nunca duplica (UNIQUE ticket_id).
-- El primer boleto se precarga con el nombre del comprador (editable).
create or replace function public.protocol_sync_order(p_order uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare o record; v_token text; v_has_people boolean; t record; v_first boolean;
begin
  select id, org_id, event_id, status, buyer_name, buyer_email, buyer_phone, buyer_city
    into o from public.orders where id = p_order;
  if o.id is null or o.event_id is null or o.status <> 'paid' then return null; end if;
  if not public.protocol_enabled_for_event(o.event_id) then return null; end if;

  insert into public.protocol_orders (order_id, org_id, event_id)
  values (o.id, o.org_id, o.event_id) on conflict (order_id) do nothing;
  select access_token into v_token from public.protocol_orders where order_id = o.id;

  -- Serializa sincronizaciones concurrentes de la misma orden.
  perform 1 from public.protocol_orders where order_id = o.id for update;
  select exists (select 1 from public.protocol_people where order_id = o.id) into v_has_people;
  v_first := not v_has_people;

  for t in select id from public.tickets
           where order_id = o.id and status in ('valid','checked_in') order by created_at, id loop
    insert into public.protocol_people (org_id, event_id, kind, ticket_id, order_id, full_name, email, phone, city, category)
    values (o.org_id, o.event_id, 'ticket', t.id, o.id,
            case when v_first then nullif(btrim(o.buyer_name), '') end,
            case when v_first then o.buyer_email end,
            case when v_first then o.buyer_phone end,
            o.buyer_city,
            case when v_first and nullif(btrim(o.buyer_name), '') is not null then 'holder' end)
    on conflict (ticket_id) do nothing;
    v_first := false;
  end loop;
  return v_token;
end $$;

create or replace function public.protocol_sync_event(p_event uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not public.protocol_enabled_for_event(p_event) then return 0; end if;
  for r in select o.id from public.orders o
           where o.event_id = p_event and o.status = 'paid'
             and exists (select 1 from public.tickets t where t.order_id = o.id and t.status in ('valid','checked_in')
                         and not exists (select 1 from public.protocol_people p where p.ticket_id = t.id))
  loop
    perform public.protocol_sync_order(r.id); n := n + 1;
  end loop;
  -- Asegura acceso de comprador para órdenes pagadas ya materializadas.
  insert into public.protocol_orders (order_id, org_id, event_id)
  select o.id, o.org_id, o.event_id from public.orders o
  where o.event_id = p_event and o.status = 'paid'
  on conflict (order_id) do nothing;
  return n;
end $$;

-- Asigna (o mueve) una persona a una mesa respetando la capacidad. Lock pesimista
-- sobre la mesa → dos admins no pueden sobrepasarla en paralelo.
create or replace function public.protocol_assign_table(
  p_table uuid, p_person uuid, p_allow_over boolean, p_actor uuid, p_seat text default null)
returns text language plpgsql security definer set search_path = public as $$
declare tb record; v_used int; v_ev uuid;
begin
  select id, org_id, event_id, capacity, reserved_seats into tb
    from public.protocol_tables where id = p_table for update;
  if tb.id is null then raise exception 'mesa no encontrada' using errcode = 'no_data_found'; end if;
  select event_id into v_ev from public.protocol_people where id = p_person;
  if v_ev is distinct from tb.event_id then raise exception 'la persona no pertenece a este evento' using errcode = 'check_violation'; end if;

  if exists (select 1 from public.protocol_table_assignments where event_id = tb.event_id and person_id = p_person and table_id = p_table) then
    update public.protocol_table_assignments set seat_label = p_seat, updated_by = p_actor, updated_by_kind = 'admin'
     where event_id = tb.event_id and person_id = p_person;
    return 'unchanged';
  end if;

  select count(*) into v_used from public.protocol_table_assignments where table_id = p_table;
  if v_used + tb.reserved_seats >= tb.capacity and not coalesce(p_allow_over, false) then
    raise exception 'mesa llena (capacidad %)', tb.capacity using errcode = 'check_violation', hint = 'capacity';
  end if;

  insert into public.protocol_table_assignments (org_id, event_id, table_id, person_id, seat_label, over_capacity, updated_by, updated_by_kind)
  values (tb.org_id, tb.event_id, p_table, p_person, p_seat, v_used + tb.reserved_seats >= tb.capacity, p_actor, 'admin')
  on conflict (event_id, person_id) do update
    set table_id = excluded.table_id, seat_label = excluded.seat_label, over_capacity = excluded.over_capacity,
        updated_by = excluded.updated_by, updated_by_kind = 'admin';
  return 'ok';
end $$;

revoke all on function public.protocol_enabled_for_event(uuid) from public;
revoke all on function public.protocol_sync_order(uuid) from public;
revoke all on function public.protocol_sync_event(uuid) from public;
revoke all on function public.protocol_assign_table(uuid, uuid, boolean, uuid, text) from public;
revoke all on function public.protocol_guard_scope() from public;
revoke all on function public.protocol_people_rules() from public;
revoke all on function public.protocol_links_rules() from public;
revoke all on function public.protocol_tables_rules() from public;
revoke all on function public.protocol_mirror_attendee() from public;
revoke all on function public.protocol_audit() from public;
grant execute on function public.protocol_enabled_for_event(uuid) to service_role;
grant execute on function public.protocol_sync_order(uuid) to service_role;
grant execute on function public.protocol_sync_event(uuid) to service_role;
grant execute on function public.protocol_assign_table(uuid, uuid, boolean, uuid, text) to service_role;

-- ============================================================================
-- RLS: lectura solo para owner/admin/staff de la org dueña CON el feature activo.
-- Sin políticas de escritura → las escrituras van exclusivamente por el servidor
-- (service_role) después de resolver tenant y rol desde la sesión.
-- `protocol_orders` (contiene el token del comprador) solo para owner/admin.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['protocol_event_settings','protocol_people','protocol_meal_sessions',
                           'protocol_meal_invitations','protocol_tables','protocol_table_assignments',
                           'protocol_audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_org_member(org_id, array[''owner'',''admin'',''staff'']) and public.org_has_feature(org_id, ''protocol''))', t || '_read', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

alter table public.protocol_orders enable row level security;
create policy protocol_orders_read on public.protocol_orders for select
  using (public.is_org_member(org_id, array['owner','admin']) and public.org_has_feature(org_id, 'protocol'));
revoke all on table public.protocol_orders from anon, authenticated;
grant select on table public.protocol_orders to authenticated;
grant all on table public.protocol_orders to service_role;

-- ============================================================================
-- Habilitación EXCLUSIVA para Fuente de Vida (por slug real, sin UUID inventado).
-- Los eventos NO se activan aquí: el organizador los activa uno por uno.
-- ============================================================================
insert into public.org_features (org_id, feature)
select id, 'protocol' from public.organizations
where slug = 'ministerio-internacional-fuente-de-vida-0530b4'
on conflict (org_id, feature) do nothing;
