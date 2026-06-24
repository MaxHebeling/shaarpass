-- Portadas de evento: bucket público 'event-covers'.
-- Lectura pública; escritura solo por miembros de la org dueña del evento
-- (carpeta = id del evento → public.event_org → is_org_member). Aplicado en Supabase.
insert into storage.buckets (id, name, public) values ('event-covers','event-covers',true)
on conflict (id) do nothing;
