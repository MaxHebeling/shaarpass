-- Bajas de correos de marketing (cumplimiento anti-spam).
-- email_optouts(email PK, created_at); RLS sin policies (solo server/RPC).
-- fn email_optout(p_email) SECURITY DEFINER, idempotente, grant a anon/authenticated
--   (la usa la página pública /unsubscribe con enlace firmado HMAC).
-- sendBulkEmail filtra estos correos y agrega enlace de baja + header List-Unsubscribe.
-- Aplicado en el proyecto Supabase (migración 0035).
create table public.email_optouts (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.email_optouts enable row level security;
