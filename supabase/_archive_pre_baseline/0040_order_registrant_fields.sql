-- Datos del registrante en cada orden (nombre, ciudad, país, WhatsApp).
alter table public.orders add column if not exists buyer_name text;
alter table public.orders add column if not exists buyer_phone text;
alter table public.orders add column if not exists buyer_city text;
alter table public.orders add column if not exists buyer_country text;
