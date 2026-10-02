-- 0012_lock_down_rpcs_public.sql — completa 0011.
--
-- En PostgreSQL, CREATE FUNCTION otorga EXECUTE a PUBLIC por defecto; `anon` y
-- `authenticated` lo HEREDAN de PUBLIC. Por eso `REVOKE ... FROM anon, authenticated`
-- (0011) no cerró las funciones que aún tenían el grant a PUBLIC. Aquí revocamos de
-- PUBLIC y re-otorgamos EXECUTE de forma EXPLÍCITA solo al rol que debe ejecutarlas.
--
-- Idempotente y seguro: service_role recibe grant explícito (las rutas backend con
-- createAdminClient no se afectan); las funciones del flujo público/token-gated y los
-- helpers de RLS NO se tocan (conservan su acceso vía PUBLIC).

-- GRUPO A — solo service_role (backend / cron / trigger). Sin PUBLIC/anon/authenticated.
do $$
declare f text;
begin
  foreach f in array array[
    'buy_listing(uuid, text)',
    'cancel_listing(uuid)',
    'bump_campaign_metric(uuid, text)',
    'bump_staff_activity(uuid)',
    'cleanup_rate_hits()',
    'admit_all_queues()',
    'release_expired_seats()',
    'release_expired_event_seats()',
    'sync_event_bounds()',
    'hold_seats(uuid[], text, integer)',
    'hold_event_seats(uuid[], text, integer)',
    'buyer_ticket_count(uuid, text)',
    'is_queue_admitted(uuid, text)',
    'mark_queue_used(text)',
    'validate_presale_code(uuid, text)',
    'consume_presale_code(uuid, text)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated;', f);
    execute format('grant execute on function public.%s to service_role;', f);
  end loop;
end $$;

-- GRUPO B — service_role + authenticated (dashboard autenticado). Sin PUBLIC/anon.
do $$
declare f text;
begin
  foreach f in array array[
    'delete_order(uuid)',
    'delete_venue(uuid)',
    'verify_rotating_code(text, text, bigint)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon;', f);
    execute format('grant execute on function public.%s to authenticated, service_role;', f);
  end loop;
end $$;
