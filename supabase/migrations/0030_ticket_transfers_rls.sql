-- Fix (TM-2): ticket_transfers estaba sin RLS → expuesta a anon vía PostgREST
-- (incluye from_email/to_email, PII). Habilita RLS; las escrituras van por RPCs
-- SECURITY DEFINER (transfer_ticket/buy_listing) y no se afectan. Lectura solo
-- para miembros de la org dueña del evento del boleto:
--   using is_org_member(event_org((select event_id from tickets where id=ticket_id)))
-- Aplicado en el proyecto Supabase (migración 0030).
alter table public.ticket_transfers enable row level security;
