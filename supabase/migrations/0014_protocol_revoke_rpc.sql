-- ============================================================================
-- 0014 · Cierra la ejecución de las funciones del módulo de Protocolo
-- ============================================================================
-- Supabase concede EXECUTE a anon/authenticated mediante default privileges
-- (no vía PUBLIC), así que el `revoke ... from public` de 0013 no bastaba: un
-- cliente con la anon key podía invocar /rest/v1/rpc/protocol_sync_order y
-- obtener el token de una orden si conocía su UUID. Detectado por el security
-- advisor justo después de aplicar 0013; corregido antes de activar el módulo
-- en cualquier evento (protocol_event_settings estaba vacío → sin exposición real).
revoke execute on function public.protocol_enabled_for_event(uuid) from anon, authenticated;
revoke execute on function public.protocol_sync_order(uuid) from anon, authenticated;
revoke execute on function public.protocol_sync_event(uuid) from anon, authenticated;
revoke execute on function public.protocol_assign_table(uuid, uuid, boolean, uuid, text) from anon, authenticated;
revoke execute on function public.protocol_guard_scope() from anon, authenticated;
revoke execute on function public.protocol_people_rules() from anon, authenticated;
revoke execute on function public.protocol_links_rules() from anon, authenticated;
revoke execute on function public.protocol_tables_rules() from anon, authenticated;
revoke execute on function public.protocol_mirror_attendee() from anon, authenticated;
revoke execute on function public.protocol_audit() from anon, authenticated;
-- org_has_feature se usa en políticas RLS (requiere authenticated), nunca anon.
revoke execute on function public.org_has_feature(uuid, text) from anon;
