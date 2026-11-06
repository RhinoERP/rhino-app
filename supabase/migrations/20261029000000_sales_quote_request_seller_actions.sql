create or replace function public.cancel_own_sales_quote_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  select created_by, status
    into v_created_by, v_status
  from public.sales_quote_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Cotización no encontrada';
  end if;
  if v_created_by <> auth.uid() then
    raise exception 'Solo podés dar de baja tus propias cotizaciones';
  end if;
  if v_status not in ('PENDING_APPROVAL', 'RETURNED') then
    raise exception 'Solo se pueden dar de baja cotizaciones pendientes o devueltas';
  end if;

  update public.sales_quote_requests
  set status = 'CANCELLED',
      updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.cancel_own_sales_quote_request(uuid)
  from public, anon;
grant execute on function public.cancel_own_sales_quote_request(uuid)
  to authenticated;
