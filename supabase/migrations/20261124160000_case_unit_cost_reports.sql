begin;

-- Report and integration RPCs are patched only when installed. The catalog,
-- cost source and shared sale-edit routine are core dependencies, not optional.
do $$
declare v_table text;
begin
  foreach v_table in array array['products', 'products_with_price', 'price_list_items'] loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Falta la dependencia central public.% para los costos por unidad de CAJA', v_table;
    end if;
  end loop;
  if to_regprocedure('public.update_sale_order_atomic(uuid,uuid,uuid,uuid,date,date,integer,public.invoice_type,text,text,numeric,jsonb,jsonb)') is null then
    raise exception 'Falta la dependencia central public.update_sale_order_atomic para CAJA';
  end if;
end;
$$;

-- Remove only floating-point noise from proportional case prices before the
-- final cent truncation. Other units retain their established monetary policy.
create function public.case_aware_line_amount(p_product_id uuid, p_quantity numeric, p_unit_price numeric)
returns numeric language sql stable security invoker set search_path = '' as $$
  select trunc(case when exists (
    select 1 from public.products p where p.id = p_product_id and p.unit_of_measure::text = 'CAJA'
  ) then round(p_quantity * p_unit_price, 8) else p_quantity * p_unit_price end, 2)
$$;
revoke all on function public.case_aware_line_amount(uuid,numeric,numeric) from public, anon;
grant execute on function public.case_aware_line_amount(uuid,numeric,numeric) to authenticated, service_role;

-- Report-only cost sources. Catalog/list prices retain their commercial (box)
-- meaning. These security-invoker views preserve the source row shape and RLS,
-- changing only the cost basis used with individual-unit quantities.
do $$
declare
  v_source text;
  v_columns text;
  v_join text;
begin
  foreach v_source in array array['products_with_price', 'price_list_items'] loop
    select string_agg(case when a.attname = 'cost_price' then
      'case when p.unit_of_measure::text = ''CAJA'' then s.cost_price / nullif(p.units_per_box, 0) else s.cost_price end as cost_price'
      else format('s.%I', a.attname) end, ', ' order by a.attnum)
    into v_columns
    from pg_attribute a
    where a.attrelid = ('public.' || v_source)::regclass
      and a.attnum > 0 and not a.attisdropped;
    v_join := case when v_source = 'products_with_price' then
      'p.id = s.id and p.organization_id = s.organization_id' else 'p.id = s.product_id' end;
    execute format('create view public.%I with (security_invoker = true) as
      select %s from public.%I s join public.products p on %s',
      v_source || '_base_unit_cost', v_columns, v_source, v_join);
    execute format('revoke all on public.%I from public, anon, authenticated', v_source || '_base_unit_cost');
    execute format('grant select on public.%I to authenticated, service_role', v_source || '_base_unit_cost');
  end loop;
end;
$$;

-- Keep the deployed report's permission guards, filters, currency policy and
-- aggregation logic. Replace only its cost sources, not entire report bodies.
do $$
declare v_function record; v_definition text; v_updated text;
begin
  for v_function in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'get_financial_balance', 'get_inventory_stock_metrics',
      'get_profitability_metrics', 'get_control_tower_kpis'
    )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    v_updated := regexp_replace(v_definition, '\mproducts_with_price\M', 'products_with_price_base_unit_cost', 'g');
    v_updated := regexp_replace(v_updated, '\mprice_list_items\M', 'price_list_items_base_unit_cost', 'g');
    if v_updated <> v_definition then execute v_updated; end if;
  end loop;
end;
$$;

-- The shared sale edit RPC used to round every unit price to cents before
-- multiplying. Read CAJA metadata from the product rather than trusting JSON.
do $$
declare v_definition text; v_updated text;
begin
  v_definition := pg_get_functiondef('public.update_sale_order_atomic(uuid,uuid,uuid,uuid,date,date,integer,public.invoice_type,text,text,numeric,jsonb,jsonb)'::regprocedure);
  v_updated := replace(v_definition,
    'round(greatest(pi.unit_price, 0), 2) as unit_price',
    'case when exists (select 1 from public.products case_product where case_product.id = pi.product_id and case_product.organization_id = p_org_id and case_product.unit_of_measure::text = ''CAJA'') then greatest(pi.unit_price, 0) else round(greatest(pi.unit_price, 0), 2) end as unit_price');
  if v_updated = v_definition then
    raise exception 'La normalización de precios de update_sale_order_atomic cambió; revisar CAJA';
  end if;
  v_updated := replace(v_updated,
    'round(greatest(pi.base_price, 0), 2) as base_price',
    'case when pr.unit_of_measure::text = ''CAJA'' then greatest(pi.base_price, 0) else round(greatest(pi.base_price, 0), 2) end as base_price');
  execute v_updated;
end;
$$;

-- Offline replay and receipt fiscal validation calculate totals inside SQL.
-- Align them with JS cent truncation, including a whole box priced at 1 / 3.
do $$
declare v_function record; v_definition text; v_updated text;
begin
  for v_function in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('create_offline_pre_sale_atomic', 'apply_warehouse_purchase_receipt')
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if v_function.proname = 'create_offline_pre_sale_atomic' then
      v_updated := replace(v_definition,
        'trunc((item->>''quantity'')::numeric * (item->>''unitPrice'')::numeric, 2)',
        'public.case_aware_line_amount((item->>''productId'')::uuid, (item->>''quantity'')::numeric, (item->>''unitPrice'')::numeric)');
    else
      v_updated := regexp_replace(v_definition,
        'trunc\(\(case when pri.unit_quantity > 0\s+then pri.unit_quantity else pri.quantity end\) \* pri.unit_cost, 2\)',
        'public.case_aware_line_amount(pri.product_id, case when pri.unit_quantity > 0 then pri.unit_quantity else pri.quantity end, pri.unit_cost)', 'g');
    end if;
    if v_updated <> v_definition then execute v_updated; end if;
  end loop;
end;
$$;

commit;
