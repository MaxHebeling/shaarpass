create or replace function public.bump_campaign_metric(p_campaign uuid, p_field text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_field = 'delivered' then update public.campaigns set delivered_count = delivered_count + 1 where id = p_campaign;
  elsif p_field = 'opened' then update public.campaigns set opened_count = opened_count + 1 where id = p_campaign;
  elsif p_field = 'clicked' then update public.campaigns set clicked_count = clicked_count + 1 where id = p_campaign;
  elsif p_field = 'bounced' then update public.campaigns set bounced_count = bounced_count + 1 where id = p_campaign;
  elsif p_field = 'unsub' then update public.campaigns set unsub_count = unsub_count + 1 where id = p_campaign;
  end if;
end; $$;
grant execute on function public.bump_campaign_metric(uuid, text) to service_role;
