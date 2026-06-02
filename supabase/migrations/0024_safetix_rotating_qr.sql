-- TM-3: QR rotativo seguro (TOTP HMAC-SHA1, paso 15s) estilo SafeTix.
alter table public.events add column if not exists safetix_enabled boolean not null default false;
alter table public.tickets add column if not exists totp_secret text default encode(extensions.gen_random_bytes(20), 'hex');
update public.tickets set totp_secret = encode(extensions.gen_random_bytes(20), 'hex') where totp_secret is null;

-- Genera el código rotativo actual (no expone el secreto).
create or replace function public.ticket_rotating_code(p_token text)
returns table(bearer text, otp text, counter bigint)
language plpgsql security definer set search_path = public, extensions stable
as $$
declare v_secret text; v_counter bigint;
begin
  select totp_secret into v_secret from public.tickets where qr_token = p_token;
  if v_secret is null then return query select p_token, ''::text, 0::bigint; return; end if;
  v_counter := floor(extract(epoch from now()) / 15)::bigint;
  return query select p_token,
    substr(encode(extensions.hmac(int8send(v_counter), decode(v_secret, 'hex'), 'sha1'), 'hex'), 1, 10), v_counter;
end $$;

-- Verifica un código escaneado (otp correcto + counter fresco ±30-45s).
create or replace function public.verify_rotating_code(p_token text, p_otp text, p_counter bigint)
returns boolean language plpgsql security definer set search_path = public, extensions stable
as $$
declare v_secret text; v_now bigint; v_expected text;
begin
  select totp_secret into v_secret from public.tickets where qr_token = p_token;
  if v_secret is null then return false; end if;
  v_now := floor(extract(epoch from now()) / 15)::bigint;
  if p_counter < v_now - 2 or p_counter > v_now + 1 then return false; end if;
  v_expected := substr(encode(extensions.hmac(int8send(p_counter), decode(v_secret, 'hex'), 'sha1'), 'hex'), 1, 10);
  return v_expected = p_otp;
end $$;

grant execute on function public.ticket_rotating_code(text) to anon, authenticated, service_role;
grant execute on function public.verify_rotating_code(text, text, bigint) to anon, authenticated, service_role;
