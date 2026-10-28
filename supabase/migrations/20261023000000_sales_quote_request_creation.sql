alter table public.sales_quote_requests
  add column price_level_id uuid references public.price_levels(id) on delete set null,
  add column sales_price_list_id uuid references public.sales_price_lists(id) on delete set null,
  add column exchange_rate numeric check (exchange_rate is null or exchange_rate > 0);

alter table public.sales_quote_request_items
  add column product_currency_snapshot text not null default 'ARS';

drop policy if exists "Sales quote request items are visible with their parent request"
  on public.sales_quote_request_items;
create policy "Organization admins can read sales quote request item snapshots"
  on public.sales_quote_request_items for select to authenticated
  using (
    public.user_has_org_permission('organization.admin', organization_id)
  );

create or replace function public.create_sales_quote_request(
  p_request jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid := gen_random_uuid();
  v_org_id uuid := nullif(p_request->>'organization_id', '')::uuid;
  v_customer_id uuid := nullif(p_request->>'customer_id', '')::uuid;
  v_created_by uuid := nullif(p_request->>'created_by', '')::uuid;
  v_subtotal numeric := coalesce((p_request->>'subtotal_amount')::numeric, 0);
  v_tax numeric := coalesce((p_request->>'tax_amount')::numeric, 0);
  v_total numeric := coalesce((p_request->>'total_amount')::numeric, 0);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación de servidor requerida';
  end if;
  if v_org_id is null or v_customer_id is null or v_created_by is null
    or v_subtotal < 0 or v_tax < 0 or v_total <> trunc(v_subtotal + v_tax, 2) then
    raise exception 'La solicitud de venta está incompleta o contiene importes inválidos';
  end if;
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array' then
    raise exception 'La solicitud debe incluir una lista de productos';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'La solicitud debe incluir al menos un producto';
  end if;
  if p_request->>'customer_segment' not in ('ACTIVE', 'NEW', 'REACTIVATED') then
    raise exception 'Segmento de cliente inválido';
  end if;
  if not exists (
    select 1 from public.customers c
    where c.id = v_customer_id and c.organization_id = v_org_id
      and coalesce(c.is_active, false)
  ) then
    raise exception 'El cliente no pertenece a la organización o está inactivo';
  end if;
  if nullif(p_request->>'price_level_id', '') is not null and not exists (
    select 1 from public.price_levels pl
    where pl.id = (p_request->>'price_level_id')::uuid
      and pl.organization_id = v_org_id
  ) then
    raise exception 'El nivel de precios no pertenece a la organización';
  end if;
  if nullif(p_request->>'sales_price_list_id', '') is not null and not exists (
    select 1 from public.sales_price_lists spl
    where spl.id = (p_request->>'sales_price_list_id')::uuid
      and spl.organization_id = v_org_id
  ) then
    raise exception 'La lista de precios no pertenece a la organización';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      product_id uuid, product_variant_id uuid, quantity numeric,
      base_unit_price numeric, competitor_unit_price numeric,
      agreed_unit_price numeric, discount_percentage numeric,
      discount_amount numeric, price_increase_amount numeric,
      adjustment_type text, line_subtotal numeric, taxes_snapshot jsonb
    )
    left join public.products p
      on p.id = x.product_id and p.organization_id = v_org_id and p.is_active = true
    left join public.product_variants pv
      on pv.id = x.product_variant_id and pv.product_id = x.product_id
        and pv.organization_id = v_org_id and pv.is_active = true
    where p.id is null
      or x.product_variant_id is not null and pv.id is null
      or x.quantity is null or x.quantity <= 0
      or x.base_unit_price is null or x.base_unit_price < 0
      or x.competitor_unit_price is null or x.competitor_unit_price < 0
      or x.agreed_unit_price is null or x.agreed_unit_price < 0
      or x.discount_percentage is null or x.discount_percentage < 0 or x.discount_percentage > 100
      or x.discount_amount is null or x.discount_amount < 0
      or x.price_increase_amount is null or x.price_increase_amount < 0
      or x.adjustment_type is null
      or x.adjustment_type not in ('NONE', 'DISCOUNT', 'PRICE_OVERRIDE')
      or x.line_subtotal is null or x.line_subtotal < 0
      or coalesce(jsonb_typeof(x.taxes_snapshot), 'null') <> 'array'
  ) then
    raise exception 'Una o más líneas de la solicitud contienen datos inválidos';
  end if;
  if (select coalesce(sum(x.line_subtotal), 0)
      from jsonb_to_recordset(p_items) as x(line_subtotal numeric)) <> v_subtotal then
    raise exception 'El subtotal no coincide con las líneas';
  end if;

  insert into public.sales_quote_requests (
    id, organization_id, customer_id, created_by, seller_user_id,
    seller_name_snapshot, seller_zone_snapshot, customer_segment, status,
    currency, exchange_rate, price_level_id, sales_price_list_id,
    payment_method, payment_term, invoice_type, subtotal_amount,
    tax_amount, total_amount, seller_observations
  ) values (
    v_request_id, v_org_id, v_customer_id, v_created_by,
    nullif(p_request->>'seller_user_id', '')::uuid,
    nullif(p_request->>'seller_name_snapshot', ''),
    nullif(p_request->>'seller_zone_snapshot', ''),
    p_request->>'customer_segment', 'PENDING_APPROVAL',
    coalesce(nullif(p_request->>'currency', ''), 'ARS'),
    nullif(p_request->>'exchange_rate', '')::numeric,
    nullif(p_request->>'price_level_id', '')::uuid,
    nullif(p_request->>'sales_price_list_id', '')::uuid,
    nullif(p_request->>'payment_method', ''),
    nullif(p_request->>'payment_term', ''),
    nullif(p_request->>'invoice_type', ''),
    v_subtotal, v_tax, v_total,
    nullif(p_request->>'seller_observations', '')
  );

  insert into public.sales_quote_request_items (
    request_id, organization_id, line_number, product_id, product_variant_id,
    product_name_snapshot, sku_snapshot, unit_of_measure_snapshot, quantity,
    base_unit_price, competitor_unit_price, agreed_unit_price,
    discount_percentage, discount_amount, price_increase_amount,
    adjustment_type, unit_cost_snapshot, line_subtotal, taxes_snapshot,
    product_comment, product_currency_snapshot
  ) select
    v_request_id, v_org_id, x.line_number, x.product_id, x.product_variant_id,
    x.product_name_snapshot, x.sku_snapshot, x.unit_of_measure_snapshot, x.quantity,
    x.base_unit_price, x.competitor_unit_price, x.agreed_unit_price,
    x.discount_percentage, x.discount_amount, x.price_increase_amount,
    x.adjustment_type, x.unit_cost_snapshot, x.line_subtotal, x.taxes_snapshot,
    nullif(x.product_comment, ''), coalesce(nullif(x.product_currency_snapshot, ''), 'ARS')
  from jsonb_to_recordset(p_items) as x(
    line_number integer, product_id uuid, product_variant_id uuid,
    product_name_snapshot text, sku_snapshot text, unit_of_measure_snapshot text,
    quantity numeric, base_unit_price numeric, competitor_unit_price numeric,
    agreed_unit_price numeric, discount_percentage numeric, discount_amount numeric,
    price_increase_amount numeric, adjustment_type text, unit_cost_snapshot numeric,
    line_subtotal numeric, taxes_snapshot jsonb, product_comment text,
    product_currency_snapshot text
  );

  return v_request_id;
end;
$$;

revoke all on function public.create_sales_quote_request(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_sales_quote_request(jsonb, jsonb)
  to service_role;

-- El precio acordado se sugiere igualando a la competencia.
