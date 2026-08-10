-- Un check-in por boleto (idempotente): evita filas de auditoría duplicadas si un
-- escaneo se reenvía (p.ej. la cola offline sincroniza dos veces).
delete from public.checkin_log where id in (
  select id from (
    select id, row_number() over (partition by ticket_id order by at asc, id asc) rn
    from public.checkin_log
  ) t where rn > 1
);
create unique index if not exists checkin_log_ticket_uniq on public.checkin_log(ticket_id);
