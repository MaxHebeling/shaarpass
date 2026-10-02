-- 0011_lock_down_rpcs.sql — BLINDAJE: cierre de la superficie de RPC (PostgREST).
--
-- PostgREST expone TODA función en `public` en /rest/v1/rpc/<fn> a quien tenga la
-- anon/publishable key (pública) o un JWT de usuario, salvo que se revoque EXECUTE.
-- Varias funciones SECURITY DEFINER solo deben ejecutarse desde el servidor
-- (service_role), desde cron o desde un trigger. Este migration les quita EXECUTE a
-- `anon`/`authenticated`. `service_role` CONSERVA EXECUTE (bypassa RLS y mantiene sus
-- grants), por lo que las rutas del backend que usan createAdminClient siguen igual.
--
-- Verificado contra los call-sites reales en src/:
--   * createAdminClient (service_role): checkout, webhooks/stripe, webhooks/resend,
--     checkin/staff, cron/*  -> seguras tras revocar anon+authenticated.
--   * createClient (usuario autenticado): dashboard/*  -> se conserva `authenticated`.
--   * createPublicClient (anon): flujo público/token-gated  -> NO se toca.
--
-- NO se tocan (requeridas por el flujo o por las RLS policies):
--   event_org, is_org_member, map_org  (helpers usados dentro de las policies RLS),
--   hit_rate_limit (lo invoca el rate-limiter con cliente anon en rutas públicas),
--   available_stock, email_optout, join_queue, queue_status, list_ticket,
--   transfer_ticket, register_presale, validate_promo_code, staff_session,
--   ticket_brand, ticket_event_info, ticket_rotating_code  (público/token-gated).

-- =====================================================================
-- 1) Solo servidor (service_role), cron o trigger: sin anon NI authenticated
-- =====================================================================

-- CRÍTICO: buy_listing regenera qr_token/totp y transfiere el boleto SIN verificar
-- pago. Solo la llama el webhook de Stripe (service_role) tras validar la firma.
-- Con EXECUTE para `authenticated`, cualquier usuario logueado podía obtener un
-- boleto de reventa GRATIS llamando la RPC directo. Se cierra.
revoke execute on function public.buy_listing(uuid, text) from anon, authenticated;

-- CRÍTICO: cancel_listing NO valida propiedad (update ... where id=p_listing). Con
-- EXECUTE para anon, cualquier visitante podía cancelar CUALQUIER reventa activa.
-- No tiene call-site en la app; queda solo para service_role.
revoke execute on function public.cancel_listing(uuid) from anon, authenticated;

-- Métricas/mantenimiento sin autorización: solo backend/cron.
revoke execute on function public.bump_campaign_metric(uuid, text) from anon, authenticated;
revoke execute on function public.bump_staff_activity(uuid) from anon, authenticated;
revoke execute on function public.cleanup_rate_hits() from anon, authenticated;

-- Cola virtual / anti-bot: admit_all_queues saltaba la fila de cualquier evento si
-- lo llamaba un usuario logueado. Es función de cron.
revoke execute on function public.admit_all_queues() from anon, authenticated;

-- Liberación de asientos expirados: cron.
revoke execute on function public.release_expired_seats() from anon, authenticated;
revoke execute on function public.release_expired_event_seats() from anon, authenticated;

-- Trigger de normalización de fechas de evento (no se llama por RPC).
revoke execute on function public.sync_event_bounds() from anon, authenticated;

-- Flujo de checkout: lo ejecuta la ruta /api/checkout con service_role.
revoke execute on function public.hold_seats(uuid[], text, integer) from anon, authenticated;
revoke execute on function public.hold_event_seats(uuid[], text, integer) from anon, authenticated;
revoke execute on function public.buyer_ticket_count(uuid, text) from anon, authenticated;
revoke execute on function public.is_queue_admitted(uuid, text) from anon, authenticated;
revoke execute on function public.mark_queue_used(text) from anon, authenticated;
revoke execute on function public.validate_presale_code(uuid, text) from anon, authenticated;
revoke execute on function public.consume_presale_code(uuid, text) from anon, authenticated;

-- =====================================================================
-- 2) Solo quitar anon (la app autenticada SÍ las usa desde el dashboard)
-- =====================================================================

-- delete_order / delete_venue se auto-autorizan por org_members + auth.uid() y se
-- llaman desde server actions autenticadas. anon no las necesita.
revoke execute on function public.delete_order(uuid) from anon;
revoke execute on function public.delete_venue(uuid) from anon;

-- verify_rotating_code: /api/checkin (usuario) y /api/checkin/staff (service_role).
-- anon nunca la llama.
revoke execute on function public.verify_rotating_code(text, text, bigint) from anon;
