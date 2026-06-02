-- Descuento aplicado y código usado en cada orden.
alter table public.orders add column if not exists discount_cents int not null default 0;
alter table public.orders add column if not exists promo_code_id uuid references public.promo_codes(id);

-- confirm_order_paid: además de emitir boletos, cuenta el canje del promo (solo al pagar).
-- (Ver cuerpo completo aplicado en la migración; añade el bloque que incrementa
--  promo_codes.times_redeemed cuando orders.promo_code_id no es null.)
