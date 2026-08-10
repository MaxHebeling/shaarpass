-- ============================================================================
-- Ticketera — Hardening: bloquear RPCs sensibles a anon/authenticated
-- Estas SECURITY DEFINER solo deben invocarse server-side (service role) o cron.
-- confirm_order_paid expuesto a anon = boletos gratis. create_hold = DoS de
-- inventario. check_in_ticket = check-in arbitrario. Se revoca el EXECUTE público.
--
-- NOTA: is_org_member() y event_org() NO se tocan: se usan DENTRO de las
-- policies RLS y el rol que consulta necesita EXECUTE para evaluarlas.
-- available_stock() queda público a propósito (solo lectura de disponibilidad).
-- ============================================================================

revoke execute on function public.create_hold(uuid, int, text, int)   from public, anon, authenticated;
revoke execute on function public.confirm_order_paid(uuid, text)      from public, anon, authenticated;
revoke execute on function public.cleanup_expired_holds()             from public, anon, authenticated;
revoke execute on function public.check_in_ticket(text)               from public, anon, authenticated;

grant execute on function public.create_hold(uuid, int, text, int)    to service_role;
grant execute on function public.confirm_order_paid(uuid, text)       to service_role;
grant execute on function public.cleanup_expired_holds()              to service_role, postgres;
grant execute on function public.check_in_ticket(text)                to service_role;
