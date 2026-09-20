-- Doble pasarela de pago por organización (preparación de esquema)
-- ================================================================
-- Cada organizador podrá cobrar con Stripe (default) o Mercado Pago. Esta
-- migración solo agrega la columna; el selector en el dashboard y el checkout
-- de Mercado Pago se conectan en PRs posteriores (requieren la app MP + OAuth).

alter table public.organizations add column if not exists payment_gateway text not null default 'stripe';
alter table public.organizations drop constraint if exists organizations_payment_gateway_check;
alter table public.organizations add constraint organizations_payment_gateway_check
  check (payment_gateway in ('stripe', 'mercadopago'));
