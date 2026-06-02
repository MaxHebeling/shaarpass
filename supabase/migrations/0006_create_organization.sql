-- Permite que un usuario autenticado cree su organización y quede como owner.
-- SECURITY DEFINER para romper el huevo-gallina de RLS (aún no es miembro).
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = 'insufficient_privilege';
  end if;

  insert into public.organizations (slug, name)
  values (p_slug, p_name)
  returning id into v_org;

  insert into public.org_members (org_id, user_id, role)
  values (v_org, v_uid, 'owner');

  return v_org;
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated, service_role;
