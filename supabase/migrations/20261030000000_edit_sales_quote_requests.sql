create table public.sales_quote_request_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sales_quote_requests(id) on delete cascade,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  request_snapshot jsonb not null,
  items_snapshot jsonb not null default '[]'::jsonb
);

create index sales_quote_request_history_request_changed_idx
  on public.sales_quote_request_history (request_id, changed_at desc);

alter table public.sales_quote_request_history enable row level security;

create or replace function public.update_own_sales_quote_request(
  p_request_id uuid,
  p_request jsonb,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.sales_quote_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización debe incluir al menos un producto';
  end if;

  select * into v_request
  from public.sales_quote_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Cotización no encontrada';
  end if;
  if v_request.created_by <> auth.uid() then
    raise exception 'Solo podés editar tus propias cotizaciones';
  end if;
  if v_request.status not in ('PENDING_APPROVAL', 'RETURNED') then
    raise exception 'Solo se pueden editar cotizaciones pendientes o devueltas';
  end if;
  if p_request->>'customer_segment' not in ('ACTIVE', 'NEW', 'REACTIVATED')
    or p_request->>'currency' not in ('ARS', 'USD') then
    raise exception 'Los datos comerciales de la cotización no son válidos';
  end if;
  if not exists (
    select 1 from public.customers c
    where c.id = nullif(p_request->>'customer_id', '')::uuid
      and c.organization_id = v_request.organization_id
      and coalesce(c.is_active, false)
  ) then
    raise exception 'El cliente no pertenece a la organización o está inactivo';
  end if;

  insert into public.sales_quote_request_history (
    request_id, changed_by, request_snapshot, items_snapshot
  ) values (
    p_request_id,
    auth.uid(),
    to_jsonb(v_request),
    coalesce((
      select jsonb_agg(to_jsonb(i) order by i.line_number)
      from public.sales_quote_request_items i
      where i.request_id = p_request_id
    ), '[]'::jsonb)
  );

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      product_id uuid, product_variant_id uuid, quantity numeric,
      pricing_method text,
      base_unit_price numeric, competitor_unit_price numeric,
      agreed_unit_price numeric, discount_percentage numeric,
      discount_amount numeric, price_increase_amount numeric,
      adjustment_type text, unit_cost_snapshot numeric, line_subtotal numeric,
      taxes_snapshot jsonb, product_name_snapshot text,
      product_currency_snapshot text, line_number integer
    )
    left join public.products p
      on p.id = x.product_id
      and p.organization_id = v_request.organization_id
      and p.is_active = true
    left join public.product_variants pv
      on pv.id = x.product_variant_id
      and pv.product_id = x.product_id
      and pv.organization_id = v_request.organization_id
      and pv.is_active = true
    where p.id is null
      or (x.product_variant_id is not null and pv.id is null)
      or x.quantity is null or x.quantity <= 0
      or x.pricing_method is null or x.pricing_method not in ('COMPETITOR', 'PERCENTAGE', 'LIST_PRICE')
      or x.base_unit_price is null or x.base_unit_price < 0
      or x.competitor_unit_price is null or x.competitor_unit_price < 0
      or x.agreed_unit_price is null or x.agreed_unit_price < 0
      or x.discount_percentage is null or x.discount_percentage < 0
      or x.discount_percentage > 100
      or x.discount_amount is null or x.discount_amount < 0
      or x.price_increase_amount is null or x.price_increase_amount < 0
      or x.adjustment_type not in ('NONE', 'DISCOUNT', 'PRICE_OVERRIDE')
      or x.line_subtotal is null or x.line_subtotal < 0
      or coalesce(jsonb_typeof(x.taxes_snapshot), 'null') <> 'array'
  ) then
    raise exception 'Una o más líneas contienen datos inválidos';
  end if;

  if (select coalesce(sum(x.line_subtotal), 0)
      from jsonb_to_recordset(p_items) as x(line_subtotal numeric))
      <> coalesce((p_request->>'subtotal_amount')::numeric, -1) then
    raise exception 'El subtotal no coincide con las líneas';
  end if;

  if coalesce((p_request->>'total_amount')::numeric, -1) < 0
    or coalesce((p_request->>'subtotal_amount')::numeric, -1) < 0
    or coalesce((p_request->>'tax_amount')::numeric, -1) < 0 then
    raise exception 'La cotización contiene importes inválidos';
  end if;
  if coalesce((p_request->>'total_amount')::numeric, -1)
    <> trunc(
      coalesce((p_request->>'subtotal_amount')::numeric, 0)
      + coalesce((p_request->>'tax_amount')::numeric, 0),
      2
    ) then
    raise exception 'El total no coincide con el subtotal y los impuestos';
  end if;

  update public.sales_quote_requests
  set customer_id = (p_request->>'customer_id')::uuid,
      customer_segment = p_request->>'customer_segment',
      seller_zone_snapshot = nullif(trim(p_request->>'seller_zone_snapshot'), ''),
      currency = p_request->>'currency',
      exchange_rate = nullif(p_request->>'exchange_rate', '')::numeric,
      price_level_id = nullif(p_request->>'price_level_id', '')::uuid,
      sales_price_list_id = nullif(p_request->>'sales_price_list_id', '')::uuid,
      payment_method = nullif(trim(p_request->>'payment_method'), ''),
      payment_term = nullif(trim(p_request->>'payment_term'), ''),
      invoice_type = p_request->>'invoice_type',
      subtotal_amount = (p_request->>'subtotal_amount')::numeric,
      tax_amount = (p_request->>'tax_amount')::numeric,
      total_amount = (p_request->>'total_amount')::numeric,
      seller_observations = nullif(trim(p_request->>'seller_observations'), ''),
      status = 'PENDING_APPROVAL',
      review_comment = null,
      reviewed_by = null,
      reviewed_at = null,
      updated_at = now()
  where id = p_request_id;

  delete from public.sales_quote_request_items where request_id = p_request_id;
  insert into public.sales_quote_request_items (
    request_id, organization_id, line_number, product_id, product_variant_id,
    product_name_snapshot, sku_snapshot, unit_of_measure_snapshot,
    product_currency_snapshot, quantity, pricing_method, base_unit_price, competitor_unit_price,
    agreed_unit_price, discount_percentage, discount_amount,
    price_increase_amount, adjustment_type, unit_cost_snapshot, line_subtotal,
    taxes_snapshot, product_comment
  )
  select
    p_request_id, v_request.organization_id, x.line_number, x.product_id,
    x.product_variant_id, x.product_name_snapshot, x.sku_snapshot,
    x.unit_of_measure_snapshot, coalesce(x.product_currency_snapshot, 'ARS'),
    x.quantity, x.pricing_method, x.base_unit_price, x.competitor_unit_price,
    x.agreed_unit_price, x.discount_percentage, x.discount_amount,
    x.price_increase_amount, x.adjustment_type, x.unit_cost_snapshot,
    x.line_subtotal, x.taxes_snapshot, x.product_comment
  from jsonb_to_recordset(p_items) as x(
    line_number integer, product_id uuid, product_variant_id uuid,
    product_name_snapshot text, sku_snapshot text,
    unit_of_measure_snapshot text, product_currency_snapshot text,
    quantity numeric, base_unit_price numeric, competitor_unit_price numeric,
    pricing_method text,
    agreed_unit_price numeric, discount_percentage numeric,
    discount_amount numeric, price_increase_amount numeric,
    adjustment_type text, unit_cost_snapshot numeric, line_subtotal numeric,
    taxes_snapshot jsonb, product_comment text
  );
end;
$$;

revoke all on function public.update_own_sales_quote_request(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.update_own_sales_quote_request(uuid, jsonb, jsonb)
  to authenticated;
