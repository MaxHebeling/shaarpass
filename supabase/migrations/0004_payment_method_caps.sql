-- Capabilities de métodos de pago de la cuenta conectada
-- ======================================================
-- Un método de pago (OXXO, SPEI) solo se ofrece si la cuenta Connect del
-- organizador tiene su capability ACTIVA; si no, Stripe rechazaría todo el
-- PaymentIntent y rompería el checkout. Guardamos el estado por organizador,
-- sincronizado desde account.updated / connect/return.

alter table public.organizations add column if not exists oxxo_enabled boolean not null default false;  -- oxxo_payments activa
alter table public.organizations add column if not exists spei_enabled boolean not null default false;  -- mx_bank_transfer_payments activa
