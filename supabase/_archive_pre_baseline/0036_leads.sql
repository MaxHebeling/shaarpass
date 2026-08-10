-- Captura de leads / waitlist (prospectos que aún no se registran).
-- leads(id, email, name, message, source, created_at). RLS sin policies:
-- se inserta vía /api/lead con service_role; no se lee desde clientes.
-- Aplicado en el proyecto Supabase (migración 0036).
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  message text,
  source text,
  created_at timestamptz not null default now()
);
create index leads_email_idx on public.leads (lower(email));
alter table public.leads enable row level security;
