-- Modelo de comisión por organizador: "absorbido"
-- ================================================
-- Por defecto (false) el comprador paga la comisión aparte (modelo "passed").
-- Si absorb_fees = true, el comprador paga el precio de lista exacto y el
-- organizador absorbe las comisiones (Stripe + margen de plataforma). La
-- plataforma sigue cobrando su margen vía application_fee_amount.
--
-- El encendido por organizador (p.ej. Fuente de Vida) se hace como dato,
-- por separado, no en esta migración de esquema.

alter table public.organizations add column if not exists absorb_fees boolean not null default false;
