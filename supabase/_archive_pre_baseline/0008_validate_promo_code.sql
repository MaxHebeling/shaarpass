-- Validación pública de códigos promo sin exponer la tabla ni requerir service role.
create or replace function public.validate_promo_code(p_event uuid, p_code text)
returns table(valid boolean, reason text, promo_id uuid, discount_type text, discount_value int)
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare p record;
begin
  select * into p from public.promo_codes
    where event_id = p_event and upper(code) = upper(trim(p_code)) limit 1;
  if not found then
    return query select false, 'Código no válido', null::uuid, null::text, null::int; return;
  end if;
  if p.expires_at is not null and p.expires_at < now() then
    return query select false, 'Código expirado', null::uuid, null::text, null::int; return;
  end if;
  if p.max_redemptions is not null and p.times_redeemed >= p.max_redemptions then
    return query select false, 'Código agotado', null::uuid, null::text, null::int; return;
  end if;
  return query select true, 'ok', p.id, p.discount_type, p.discount_value;
end $$;

grant execute on function public.validate_promo_code(uuid, text) to anon, authenticated, service_role;
