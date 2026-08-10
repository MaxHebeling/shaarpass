-- El índice parcial no sirve como árbitro de ON CONFLICT. Usamos uno normal:
-- los NULL (campañas manuales) se consideran distintos, así que no chocan entre sí.
drop index if exists public.campaigns_auto_uniq;
create unique index if not exists campaigns_auto_uniq on public.campaigns(event_id, automation_key);
