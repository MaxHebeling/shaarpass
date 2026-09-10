-- Cargos directos: habilitar la venta con charges_enabled (no payouts_enabled)
-- =============================================================================
-- Con cargos directos, el dinero de una venta cae directo en la cuenta Connect
-- del organizador en cuanto Stripe habilita los cobros (`charges_enabled`). El
-- `payouts_enabled` solo afecta cuándo Stripe le deposita a su banco, no si puede
-- vender. Antes el checkout exigía payouts_enabled (heredado de destination
-- charges), lo que bloqueaba la venta mientras Stripe verificaba la cuenta.
--
-- Añadimos una señal separada `charges_enabled` (puede vender) y dejamos
-- `payouts_enabled` como "totalmente habilitado / ya recibe depósitos" (UX).

begin;

alter table public.organizations add column if not exists charges_enabled boolean not null default false;

-- Backfill: si ya estaba totalmente habilitada (payouts_enabled), obviamente cobra.
update public.organizations set charges_enabled = true where payouts_enabled = true;

commit;
