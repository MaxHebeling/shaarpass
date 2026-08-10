-- ============================================================================
-- Ticketera — Programación de limpieza de holds con pg_cron
-- Separado de 0003 para que, si pg_cron no está disponible, las funciones
-- núcleo (inventario) ya estén aplicadas. pg_cron crea el schema `cron`.
-- ============================================================================
create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-expired-holds',
  '* * * * *',
  $$ select public.cleanup_expired_holds(); $$
);
