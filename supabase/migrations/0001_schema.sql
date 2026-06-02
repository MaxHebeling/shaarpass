-- ============================================================================
-- Ticketera — Esquema base (Fase 0)
-- 12 tablas core. El control de inventario atómico vive en 0003_functions.sql
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ===================== ORGANIZATIONS (multi-tenant) =====================
create table public.organizations (
  id                 uuid primary key default gen_random_uuid(),
  slug               text unique not null,
  name               text not null,
  stripe_account_id  text,                       -- Stripe Connect (acct_...)
  payouts_enabled    boolean not null default false,
  created_at         timestamptz not null default now()
);

create table public.org_members (
  org_id  uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    text not null check (role in ('owner','admin','staff','scanner')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members(user_id);

-- ===================== VENUES =====================
create table public.venues (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  name      text not null,
  address   text,
  city      text,
  country   text,
  lat       double precision,
  lng       double precision,
  capacity  int
);

-- ===================== EVENTS =====================
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  venue_id      uuid references public.venues(id),
  slug          text not null,
  title         text not null,
  description   text,
  cover_image   text,
  category      text,
  status        text not null default 'draft' check (status in ('draft','published','cancelled','ended')),
  is_online     boolean not null default false,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  timezone      text not null,
  currency      text not null default 'usd',
  city          text,                            -- denormalizado para SEO /d/{ciudad}/{cat}
  region        text,                            -- estado/provincia
  search_vector tsvector,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (org_id, slug)
);
create index events_status_starts_idx on public.events(status, starts_at);
create index events_discovery_idx on public.events(region, city, category, starts_at) where status = 'published';
create index events_search_idx on public.events using gin(search_vector);

-- ===================== TICKETING / INVENTORY =====================
create table public.ticket_types (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  name            text not null,
  price_cents     int not null check (price_cents >= 0),
  currency        text not null,
  quantity_total  int not null check (quantity_total >= 0),
  quantity_sold   int not null default 0 check (quantity_sold >= 0),
  max_per_order   int not null default 10 check (max_per_order > 0),
  sales_start     timestamptz,
  sales_end       timestamptz,
  created_at      timestamptz not null default now(),
  -- GUARDIÁN ANTI-OVERSELLING a nivel base de datos: invariante físico.
  constraint no_oversell check (quantity_sold <= quantity_total)
);
create index ticket_types_event_idx on public.ticket_types(event_id);

-- Reservas temporales durante checkout (evitan overselling y carritos zombie)
create table public.ticket_holds (
  id              uuid primary key default gen_random_uuid(),
  ticket_type_id  uuid not null references public.ticket_types(id) on delete cascade,
  quantity        int not null check (quantity > 0),
  session_id      text not null,
  order_id        uuid,                          -- se enlaza al crear la orden
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);
create index ticket_holds_active_idx on public.ticket_holds(ticket_type_id, expires_at);

-- ===================== ORDERS / PAYMENTS =====================
create table public.orders (
  id                       uuid primary key default gen_random_uuid(),
  event_id                 uuid not null references public.events(id),
  org_id                   uuid not null references public.organizations(id),
  buyer_user_id            uuid references auth.users(id),
  buyer_email              text not null,
  status                   text not null default 'pending'
                            check (status in ('pending','paid','failed','refunded','cancelled')),
  subtotal_cents           int not null,
  platform_fee_cents       int not null default 0,   -- tu comisión transparente
  total_cents              int not null,
  currency                 text not null,
  stripe_payment_intent_id text unique,              -- idempotencia del pago
  idempotency_key          text not null unique,     -- evita doble submit
  created_at               timestamptz not null default now(),
  paid_at                  timestamptz
);
create index orders_event_idx on public.orders(event_id);
create index orders_buyer_idx on public.orders(buyer_user_id);

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  ticket_type_id   uuid not null references public.ticket_types(id),
  quantity         int not null check (quantity > 0),
  unit_price_cents int not null
);
create index order_items_order_idx on public.order_items(order_id);

create table public.attendees (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  first_name text,
  last_name  text,
  email      text
);

-- Un boleto emitido = 1 fila = 1 QR
create table public.tickets (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id),
  event_id       uuid not null references public.events(id),
  attendee_id    uuid references public.attendees(id),
  qr_token       text not null unique,            -- opaco + firmado HMAC
  status         text not null default 'valid'
                  check (status in ('valid','checked_in','void','refunded')),
  checked_in_at  timestamptz,
  checked_in_by  uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index tickets_event_idx on public.tickets(event_id);
create index tickets_order_idx on public.tickets(order_id);

-- ===================== PROMO CODES =====================
create table public.promo_codes (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  code            text not null,
  discount_type   text not null check (discount_type in ('percent','fixed')),
  discount_value  int not null check (discount_value > 0),
  max_redemptions int,
  times_redeemed  int not null default 0,
  expires_at      timestamptz,
  unique (event_id, code)
);

-- ===================== PAYOUTS =====================
create table public.payouts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id),
  stripe_transfer_id text,
  amount_cents       int not null,
  currency           text not null,
  status             text not null default 'pending' check (status in ('pending','paid','failed')),
  period_start       timestamptz,
  period_end         timestamptz,
  created_at         timestamptz not null default now()
);
