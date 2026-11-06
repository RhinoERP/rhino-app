create table public.sales_quote_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sales_quote_requests(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_name text,
  changed_at timestamptz not null default now(),
  event_type text not null check (
    event_type in ('SUBMITTED', 'EDITED', 'RETURNED', 'APPROVED', 'CANCELLED')
  ),
  event_comment text,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  request_snapshot jsonb not null,
  items_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(items_snapshot) = 'array')
);

create index sales_quote_request_events_request_changed_idx
  on public.sales_quote_request_events (request_id, changed_at desc);

alter table public.sales_quote_request_events enable row level security;

create policy "Quote request members can read their request events"
  on public.sales_quote_request_events for select to authenticated
  using (
    exists (
      select 1
      from public.sales_quote_requests r
      where r.id = sales_quote_request_events.request_id
        and (
          r.created_by = auth.uid()
          or public.user_has_org_permission('organization.admin', r.organization_id)
          or public.user_has_org_permission('sales.manage.all', r.organization_id)
        )
    )
  );

-- The seller RPCs insert all request lines in one statement. This statement
-- trigger records the submitted version, or the new version after an edit,
-- in the same transaction as the request itself.
create or replace function public.log_sales_quote_request_version_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_request public.sales_quote_requests%rowtype;
  v_event_type text;
  v_changed_by_name text;
begin
  for v_request_id in select distinct request_id from inserted_request_items loop
    select * into v_request
    from public.sales_quote_requests
    where id = v_request_id;

    if not found or v_request.status <> 'PENDING_APPROVAL' then
      continue;
    end if;

    if exists (
      select 1 from public.sales_quote_request_history h
      where h.request_id = v_request_id
    ) then
      v_event_type := 'EDITED';
    else
      v_event_type := 'SUBMITTED';
    end if;

    select coalesce(
      nullif(u.raw_user_meta_data->>'full_name', ''),
      nullif(u.raw_user_meta_data->>'name', ''),
      nullif(u.email, ''),
      v_request.seller_name_snapshot
    ) into v_changed_by_name
    from auth.users u
    where u.id = coalesce(auth.uid(), v_request.created_by);

    insert into public.sales_quote_request_events (
      request_id, changed_by, changed_by_name, event_type,
      request_snapshot, items_snapshot
    ) values (
      v_request_id, coalesce(auth.uid(), v_request.created_by),
      coalesce(v_changed_by_name, v_request.seller_name_snapshot), v_event_type,
      to_jsonb(v_request),
      coalesce((
        select jsonb_agg(to_jsonb(i) order by i.line_number)
        from public.sales_quote_request_items i
        where i.request_id = v_request_id
      ), '[]'::jsonb)
    );
  end loop;
  return null;
end;
$$;

revoke all on function public.log_sales_quote_request_version_event()
  from public, anon, authenticated;

create trigger sales_quote_request_items_log_version
  after insert on public.sales_quote_request_items
  referencing new table as inserted_request_items
  for each statement
  execute function public.log_sales_quote_request_version_event();

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
  v_request public.sales_quote_requests%rowtype;
  v_item public.sales_quote_request_items%rowtype;
  v_tax jsonb;
  v_sales_order_id uuid;
  v_sales_order_item_id uuid;
  v_unit_price numeric;
  v_discount_amount numeric;
  v_discount_percentage numeric;
  v_changed_by_name text;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  if p_decision is null or p_decision not in ('APPROVED', 'RETURNED') then
    raise exception 'Decisión de revisión inválida';
  end if;
  if p_decision = 'RETURNED' and nullif(trim(p_comment), '') is null then
    raise exception 'Ingresá un comentario para devolver la solicitud';
  end if;
  if length(coalesce(p_comment, '')) > 2000 then
    raise exception 'El comentario de revisión no puede superar los 2000 caracteres';
  end if;

  select * into v_request
  from public.sales_quote_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Solicitud de venta no encontrada';
  end if;
  if not coalesce(
    public.user_has_org_permission('organization.admin', v_request.organization_id),
    false
  ) then
    raise exception 'Solo un administrador de la organización puede revisar solicitudes';
  end if;
  if v_request.status <> 'PENDING_APPROVAL' then
    raise exception 'La solicitud ya fue revisada';
  end if;

  select coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(u.email, '')
  ) into v_changed_by_name
  from auth.users u
  where u.id = auth.uid();

  if p_decision = 'RETURNED' then
    update public.sales_quote_requests
    set status = 'RETURNED',
        review_comment = nullif(trim(p_comment), ''),
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    where id = p_request_id;

    select * into v_request
    from public.sales_quote_requests
    where id = p_request_id;

    insert into public.sales_quote_request_events (
      request_id, changed_by, changed_by_name, event_type, event_comment,
      request_snapshot, items_snapshot
    ) values (
      p_request_id, auth.uid(), v_changed_by_name, 'RETURNED',
      nullif(trim(p_comment), ''),
      to_jsonb(v_request),
      coalesce((
        select jsonb_agg(to_jsonb(i) order by i.line_number)
        from public.sales_quote_request_items i
        where i.request_id = p_request_id
      ), '[]'::jsonb)
    );
    return;
  end if;

  if not exists (
    select 1 from public.sales_quote_request_items i
    where i.request_id = p_request_id
  ) then
    raise exception 'La solicitud no tiene productos para convertir en preventa';
  end if;

  insert into public.sales_orders (
    organization_id, customer_id, user_id, created_by, sale_date,
    invoice_type, currency, exchange_rate, commercial_exchange_rate,
    sub_total, total_tax_amount, total_amount,
    global_discount_percentage, global_discount_amount,
    status, preventa_status, is_historical, observations,
    sales_price_list_id, price_level_id, commercial_snapshot
  ) values (
    v_request.organization_id, v_request.customer_id,
    coalesce(v_request.seller_user_id, v_request.created_by), auth.uid(),
    current_date,
    coalesce(v_request.invoice_type, 'NOTA_DE_VENTA')::public.invoice_type,
    v_request.currency,
    v_request.exchange_rate, v_request.exchange_rate,
    v_request.subtotal_amount, v_request.tax_amount, v_request.total_amount,
    0, 0, 'DRAFT', 'APROBADA', false, v_request.seller_observations,
    v_request.sales_price_list_id, v_request.price_level_id,
    jsonb_build_object(
      'source', 'SALES_QUOTE_REQUEST',
      'salesQuoteRequestId', p_request_id,
      'sellerName', v_request.seller_name_snapshot,
      'sellerZone', v_request.seller_zone_snapshot,
      'customerSegment', v_request.customer_segment,
      'paymentMethod', v_request.payment_method,
      'paymentTerm', v_request.payment_term,
      'exchangeRate', v_request.exchange_rate,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'requestItemId', i.id,
          'productId', i.product_id,
          'productVariantId', i.product_variant_id,
          'pricingMethod', i.pricing_method,
          'baseUnitPrice', i.base_unit_price,
          'competitorUnitPrice', i.competitor_unit_price,
          'agreedUnitPrice', i.agreed_unit_price,
          'discountPercentage', i.discount_percentage,
          'quantity', i.quantity,
          'lineSubtotal', i.line_subtotal
        ) order by i.line_number)
        from public.sales_quote_request_items i
        where i.request_id = p_request_id
      ), '[]'::jsonb)
    )
  ) returning id into v_sales_order_id;

  for v_item in
    select * from public.sales_quote_request_items
    where request_id = p_request_id
    order by line_number
  loop
    v_unit_price := greatest(v_item.base_unit_price, v_item.agreed_unit_price);
    v_discount_amount := greatest(
      0,
      trunc((v_unit_price * v_item.quantity) - v_item.line_subtotal, 2)
    );
    v_discount_percentage := case
      when v_unit_price * v_item.quantity > 0
        then (v_discount_amount / (v_unit_price * v_item.quantity)) * 100
      else 0
    end;
    v_sales_order_item_id := gen_random_uuid();

    insert into public.sales_order_items (
      id, organization_id, sales_order_id, product_id, product_variant_id,
      description, quantity, unit_quantity, unit_price, base_price,
      discount_amount, discount_percentage, subtotal, currency, is_adjustment
    ) values (
      v_sales_order_item_id, v_request.organization_id, v_sales_order_id,
      v_item.product_id, v_item.product_variant_id, v_item.product_name_snapshot,
      v_item.quantity, null, v_unit_price, v_item.base_unit_price,
      v_discount_amount, v_discount_percentage, v_item.line_subtotal,
      v_request.currency, false
    );

    for v_tax in
      select value from jsonb_array_elements(coalesce(v_item.taxes_snapshot, '[]'::jsonb))
    loop
      insert into public.sales_order_item_taxes (
        organization_id, sales_order_id, sales_order_item_id, product_id,
        tax_id, name, rate, base_amount, tax_amount, tax_code_snapshot, source
      ) values (
        v_request.organization_id, v_sales_order_id, v_sales_order_item_id,
        v_item.product_id, nullif(v_tax->>'tax_id', '')::uuid,
        coalesce(nullif(v_tax->>'name', ''), 'Impuesto'),
        coalesce(nullif(v_tax->>'rate', '')::numeric, 0),
        coalesce(nullif(v_tax->>'base_amount', '')::numeric, 0),
        coalesce(nullif(v_tax->>'tax_amount', '')::numeric, 0),
        nullif(v_tax->>'tax_code_snapshot', ''),
        coalesce(nullif(v_tax->>'source', ''), 'product')
      );
    end loop;
  end loop;

  insert into public.sales_order_taxes (
    organization_id, sales_order_id, tax_id, name, rate,
    base_amount, tax_amount, tax_code_snapshot
  )
  select
    v_request.organization_id, v_sales_order_id,
    (tax.value->>'tax_id')::uuid,
    max(coalesce(nullif(tax.value->>'name', ''), 'Impuesto')),
    max(coalesce(nullif(tax.value->>'rate', '')::numeric, 0)),
    sum(coalesce(nullif(tax.value->>'base_amount', '')::numeric, 0)),
    sum(coalesce(nullif(tax.value->>'tax_amount', '')::numeric, 0)),
    max(nullif(tax.value->>'tax_code_snapshot', ''))
  from public.sales_quote_request_items i
  cross join lateral jsonb_array_elements(coalesce(i.taxes_snapshot, '[]'::jsonb)) tax(value)
  where i.request_id = p_request_id
    and nullif(tax.value->>'tax_id', '') is not null
  group by (tax.value->>'tax_id')::uuid;

  update public.sales_quote_requests
  set status = 'CONVERTED',
      sales_order_id = v_sales_order_id,
      review_comment = nullif(trim(p_comment), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  select * into v_request
  from public.sales_quote_requests
  where id = p_request_id;

  insert into public.sales_quote_request_events (
    request_id, changed_by, changed_by_name, event_type, event_comment, sales_order_id,
    request_snapshot, items_snapshot
  ) values (
    p_request_id, auth.uid(), v_changed_by_name, 'APPROVED',
    nullif(trim(p_comment), ''),
    v_sales_order_id, to_jsonb(v_request),
    coalesce((
      select jsonb_agg(to_jsonb(i) order by i.line_number)
      from public.sales_quote_request_items i
      where i.request_id = p_request_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.review_sales_quote_request(uuid, text, text)
  from public, anon;
grant execute on function public.review_sales_quote_request(uuid, text, text)
  to authenticated;

create or replace function public.cancel_own_sales_quote_request(
  p_request_id uuid,
  p_observation text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.sales_quote_requests%rowtype;
  v_changed_by_name text;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  if nullif(trim(p_observation), '') is null then
    raise exception 'Ingresá una observación para dar de baja la cotización';
  end if;
  if length(p_observation) > 2000 then
    raise exception 'La observación no puede superar los 2000 caracteres';
  end if;

  select * into v_request
  from public.sales_quote_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Cotización no encontrada';
  end if;
  if v_request.created_by <> auth.uid() then
    raise exception 'Solo podés dar de baja tus propias cotizaciones';
  end if;
  if v_request.status not in ('PENDING_APPROVAL', 'RETURNED') then
    raise exception 'Solo se pueden dar de baja cotizaciones pendientes o devueltas';
  end if;

  select coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(u.email, '')
  ) into v_changed_by_name
  from auth.users u
  where u.id = auth.uid();

  update public.sales_quote_requests
  set status = 'CANCELLED',
      cancellation_observation = trim(p_observation),
      updated_at = now()
  where id = p_request_id;

  select * into v_request
  from public.sales_quote_requests
  where id = p_request_id;

  insert into public.sales_quote_request_events (
    request_id, changed_by, changed_by_name, event_type, event_comment,
    request_snapshot, items_snapshot
  ) values (
    p_request_id, auth.uid(), v_changed_by_name, 'CANCELLED', trim(p_observation),
    to_jsonb(v_request),
    coalesce((
      select jsonb_agg(to_jsonb(i) order by i.line_number)
      from public.sales_quote_request_items i
      where i.request_id = p_request_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.cancel_own_sales_quote_request(uuid, text)
  from public, anon;
grant execute on function public.cancel_own_sales_quote_request(uuid, text)
  to authenticated;
