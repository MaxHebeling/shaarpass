-- Datos del evento para mostrar el "diseño del evento" en la página del boleto.
create or replace function public.ticket_event_info(p_token text)
returns table(title text, slug text, starts_at timestamptz, ends_at timestamptz, timezone text, cover_image text, type_name text)
language sql security definer set search_path to 'public'
as $$
  select e.title, e.slug, e.starts_at, e.ends_at, e.timezone, e.cover_image, tt.name
  from public.tickets t
  join public.events e on e.id = t.event_id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  where t.qr_token = p_token
  limit 1;
$$;
grant execute on function public.ticket_event_info(text) to anon, authenticated;
