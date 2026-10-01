-- ============================================================
-- 0010 — Lectura pública del venue de eventos publicados
-- ============================================================
-- La página pública del evento muestra el lugar (nombre + dirección), pero `venues`
-- solo tenía policy para miembros de la org → el público (anon) no podía leerlo y se
-- caía al nombre de la ciudad. Agregamos lectura pública SOLO del venue vinculado a
-- un evento publicado. Se OR-ea con la policy existente (venue_org_all).

create policy venue_public_read on public.venues for select using (
  exists (
    select 1 from public.events e
    where e.venue_id = venues.id and e.status = 'published'
  )
);
