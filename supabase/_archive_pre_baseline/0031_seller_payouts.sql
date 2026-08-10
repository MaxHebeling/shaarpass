-- TM-2b cierre: desembolso real al vendedor de reventa vía Stripe Connect Express.
-- El pago de reventa entra a la plataforma (charge sin destination); luego se
-- transfiere al vendedor (un fan) cuando conecta su cuenta de cobro.
--
-- seller_accounts(email PK, stripe_account_id, payouts_enabled, created_at)
--   RLS habilitado SIN policies → solo service_role (rutas server). Protege PII.
-- resale_payouts += claim_token (default gen_random_bytes, bearer del cobro),
--   stripe_transfer_id, paid_at. status: 'owed' | 'paid'. RLS habilitado sin
--   policies (no se lee desde clientes). Índice parcial sobre status='owed'.
-- Aplicado en el proyecto Supabase (migración 0031).
alter table public.resale_payouts add column if not exists claim_token text not null default encode(extensions.gen_random_bytes(16), 'hex');
alter table public.resale_payouts add column if not exists stripe_transfer_id text;
alter table public.resale_payouts add column if not exists paid_at timestamptz;
