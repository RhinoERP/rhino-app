create or replace function public.review_sales_quote_request(
  p_request_id uuid,
  p_decision text,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_status text;
  v_next_status text;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  if p_decision not in ('APPROVED', 'RETURNED') then
    raise exception 'Decisión de revisión inválida';
  end if;

  if p_decision = 'RETURNED' and nullif(trim(p_comment), '') is null then
    raise exception 'Ingresá un comentario para devolver la solicitud';
  end if;
  if length(coalesce(p_comment, '')) > 2000 then
    raise exception 'El comentario de revisión no puede superar los 2000 caracteres';
  end if;

  select organization_id, status
    into v_organization_id, v_status
  from public.sales_quote_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitud de venta no encontrada';
  end if;

  if not coalesce(
    public.user_has_org_permission('organization.admin', v_organization_id),
    false
  ) then
    raise exception 'Solo un administrador de la organización puede revisar solicitudes';
  end if;

  if v_status <> 'PENDING_APPROVAL' then
    raise exception 'La solicitud ya fue revisada';
  end if;

  v_next_status := p_decision;

  update public.sales_quote_requests
  set status = v_next_status,
      review_comment = nullif(trim(p_comment), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.review_sales_quote_request(uuid, text, text)
  from public, anon;
grant execute on function public.review_sales_quote_request(uuid, text, text)
  to authenticated;
