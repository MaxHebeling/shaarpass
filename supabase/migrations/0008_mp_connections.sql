-- Conexión de Mercado Pago por organización (OAuth marketplace)
-- ============================================================
-- Guarda los tokens del VENDEDOR (organizador) que autoriza a la plataforma a
-- cobrar en su nombre. Son SECRETOS: tabla con RLS sin policies para
-- anon/authenticated → solo el service role (servidor) puede leer/escribir; el
-- navegador nunca ve estos tokens. La UI usa organizations.mp_connected (booleano).

create table if not exists public.mp_connections (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  mp_user_id text,               -- collector_id del vendedor en Mercado Pago
  access_token text,
  refresh_token text,
  public_key text,
  expires_at timestamptz,
  connected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mp_connections enable row level security;
-- Sin policies = nadie (salvo service_role, que salta RLS) puede leer/escribir.
revoke all on table public.mp_connections from anon, authenticated;

-- Señal NO secreta para la UI del dashboard.
alter table public.organizations add column if not exists mp_connected boolean not null default false;
