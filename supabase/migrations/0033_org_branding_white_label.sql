-- White-label: el organizador pone su logo/color y oculta ShaarPass.
-- organizations += logo_url, brand_color (hex), white_label (bool, default false).
-- Bucket público 'org-logos'; escritura solo por miembros de la org
-- (carpeta = id de la org, vía is_org_member); lectura pública.
-- Aplicado en el proyecto Supabase (migración 0033).
alter table public.organizations add column if not exists logo_url text;
alter table public.organizations add column if not exists brand_color text;
alter table public.organizations add column if not exists white_label boolean not null default false;
