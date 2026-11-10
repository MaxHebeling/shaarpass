-- Reversión de 0013_protocol_module.sql (+ 0014, que solo revoca permisos) — SOLO si se decide retirar el módulo.
-- Es no destructiva para el resto de la plataforma: elimina únicamente objetos
-- `protocol_*` y `org_features`. Antes de ejecutarla, exporta los datos:
--   copy (select * from public.protocol_people) to stdout with csv header;  (etc.)
-- Nota: los nombres ya reflejados en `attendees` / `tickets.attendee_id` se
-- conservan (son datos válidos del boleto y el check-in los sigue usando).
--
-- Desactivación rápida SIN borrar nada (preferible):
--   update public.org_features set enabled = false where feature = 'protocol';
-- → el módulo desaparece del dashboard, del correo y del checkout al instante.

begin;
drop function if exists public.protocol_assign_table(uuid, uuid, boolean, uuid, text);
drop function if exists public.protocol_sync_event(uuid);
drop function if exists public.protocol_sync_order(uuid);
drop table if exists public.protocol_table_assignments;
drop table if exists public.protocol_tables;
drop table if exists public.protocol_meal_invitations;
drop table if exists public.protocol_meal_sessions;
drop table if exists public.protocol_people;
drop table if exists public.protocol_orders;
drop table if exists public.protocol_event_settings;
drop table if exists public.protocol_audit_log;
drop function if exists public.protocol_enabled_for_event(uuid);
drop function if exists public.protocol_audit();
drop function if exists public.protocol_mirror_attendee();
drop function if exists public.protocol_tables_rules();
drop function if exists public.protocol_links_rules();
drop function if exists public.protocol_people_rules();
drop function if exists public.protocol_guard_scope();
drop function if exists public.org_has_feature(uuid, text);
drop table if exists public.org_features;
commit;
