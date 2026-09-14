-- Campos de registro personalizados por evento
-- ============================================
-- El organizador define campos extra (empresa, puesto, etc.) que el comprador
-- llena en el checkout. Compatible hacia atrás: sin campos definidos ([]) el
-- checkout no cambia en nada.

alter table public.events add column if not exists custom_fields jsonb not null default '[]'::jsonb;   -- definición: [{key,label,type,required,options?}]
alter table public.orders add column if not exists custom_data jsonb not null default '{}'::jsonb;      -- respuestas: {key: valor}
