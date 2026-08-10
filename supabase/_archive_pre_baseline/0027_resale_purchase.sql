-- TM-2b: compra de reventa → transfiere el boleto + registra payout al vendedor.
create table public.resale_payouts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  seller_email text, amount_cents int not null,
  status text not null default 'owed' check (status in ('owed','paid')),
  created_at timestamptz not null default now()
);
alter table public.resale_payouts enable row level security;

-- buy_listing: handover atómico post-pago — marca vendido, transfiere el boleto
-- (rota qr_token/totp_secret + reasigna al comprador), registra transfer (resale)
-- y crea el payout adeudado al vendedor. SECURITY DEFINER, solo service_role
-- (lo llama el webhook al confirmar el PaymentIntent kind=resale).
-- Cuerpo completo aplicado en el proyecto Supabase (migración 0027).
-- NOTA: el DESEMBOLSO al vendedor (pagarle su monto owed por banco/tarjeta) es la
-- pieza de rails/compliance pendiente; aquí queda registrado como 'owed'.
