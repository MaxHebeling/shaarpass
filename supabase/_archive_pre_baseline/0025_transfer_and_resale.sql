-- TM-2: transferencia + reventa topada al precio original (anti-scalping).
create table public.ticket_transfers (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  from_email text, to_email text not null,
  kind text not null default 'transfer' check (kind in ('transfer','resale')),
  created_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  seller_email text,
  price_cents int not null check (price_cents >= 0),
  status text not null default 'active' check (status in ('active','sold','cancelled')),
  created_at timestamptz not null default now()
);
create index listings_event_active_idx on public.listings(event_id, status);
alter table public.listings enable row level security;
create policy listing_public_read on public.listings for select using (status = 'active');

-- transfer_ticket: reasigna + ROTA token y secreto (invalida el QR viejo).
-- list_ticket: pone en reventa topado al unit_price_cents original (face value).
-- cancel_listing. Todas SECURITY DEFINER (credencial = el token), grant anon.
-- Cuerpo completo aplicado en el proyecto Supabase (migración 0025).
-- NOTA: el PAGO fan-to-fan + payout al vendedor es TM-2b (requiere Stripe + método
--   de payout del vendedor). Aquí: transferencia gratis + creación de listing con tope.
