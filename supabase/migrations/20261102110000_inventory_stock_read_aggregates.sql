begin;

-- Only permission metadata is read as definer; product/stock/cost reads below
-- remain invoker reads. The caller cannot supply another user's identity.
create function public.get_inventory_stock_read_context(p_org_id uuid)
returns table (can_read_inventory boolean, can_read_mercadolibre boolean, can_view_costs boolean)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(m.is_owner, false) or coalesce(bool_or(p.key in (
      'organization.admin', 'inventory.read', 'inventory.read.all', 'inventory.manage'
    )), false),
    coalesce(m.is_owner, false) or coalesce(bool_or(p.key in (
      'organization.admin', 'mercadolibre.access'
    )), false),
    coalesce(m.is_owner, false) or coalesce(bool_or(p.key in (
      'organization.admin', 'inventory.manage'
    )), false)
  from public.organization_members m
  left join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
  left join public.role_permissions rp on rp.role_id = r.id
  left join public.permissions p on p.id = rp.permission_id
  where m.organization_id = p_org_id
    and m.user_id = (select auth.uid()) and m.is_active
  group by m.is_owner;
$$;

revoke all on function public.get_inventory_stock_read_context(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_inventory_stock_read_context(uuid)
  to authenticated, service_role;

-- A page/export supplies product IDs. NULL requests the complete authorized
-- catalogue for the metrics function; this is aggregated inside PostgreSQL,
-- without PostgREST's row limit or downloading individual lots to Next.js.
create function public.get_inventory_stock_balances(
  p_org_id uuid,
  p_product_ids uuid[],
  p_warehouse_id uuid default null
)
returns table (product_id uuid, quantity_available numeric, unit_quantity_available numeric)
language plpgsql stable security invoker set search_path = ''
set plan_cache_mode = force_custom_plan as $$
declare
  v_access record;
begin
  if p_org_id is null then
    raise exception using errcode = '22023', message = 'Organización inválida';
  end if;
  select * into v_access from public.get_inventory_stock_read_context(p_org_id);
  if not found then
    raise exception using errcode = '42501', message = 'Sin acceso a la organización';
  end if;
  if not (v_access.can_read_inventory or v_access.can_read_mercadolibre) then
    raise exception using errcode = '42501', message = 'Sin permiso para consultar inventario';
  end if;
  if p_warehouse_id is not null and not public.can_access_warehouse(p_org_id, p_warehouse_id) then
    raise exception using errcode = '42501', message = 'Depósito no disponible para tu usuario';
  end if;
  if cardinality(p_product_ids) > 1000 then
    raise exception using errcode = '22023', message = 'Consultá hasta 1000 productos por bloque';
  end if;

  return query
  with scoped_products as materialized (
    select p.id, coalesce(p.has_variants, false) as has_variants
    from public.products p
    where p.organization_id = p_org_id
      and (p_product_ids is null or p.id = any(p_product_ids))
      and (v_access.can_read_inventory or p.sku ilike 'MELI-%')
  ), balances as (
    select pl.product_id,
      sum(pl.quantity_available) as quantity,
      sum(coalesce(pl.unit_quantity_available, 0)) as units
    from public.product_lots pl
    join scoped_products p on p.id = pl.product_id
    left join public.product_variants pv on pv.id = pl.product_variant_id
      and pv.organization_id = p_org_id and pv.product_id = pl.product_id
    where pl.organization_id = p_org_id
      and (p_warehouse_id is null or pl.warehouse_id = p_warehouse_id)
      and (not p.has_variants or pv.is_active = true)
    group by pl.product_id
  )
  select p.id, coalesce(b.quantity, 0)::numeric, coalesce(b.units, 0)::numeric
  from scoped_products p
  left join balances b on b.product_id = p.id;
end;
$$;

revoke all on function public.get_inventory_stock_balances(uuid, uuid[], uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_inventory_stock_balances(uuid, uuid[], uuid)
  to authenticated, service_role;

-- Deliberately no page/search/category/status arguments: these are KPIs for the
-- complete organization or warehouse, not for the table's current result set.
create function public.get_inventory_stock_metrics(
  p_org_id uuid,
  p_warehouse_id uuid default null
)
returns jsonb
language plpgsql stable security invoker set search_path = ''
set plan_cache_mode = force_custom_plan as $$
declare
  v_access record;
  v_result jsonb;
begin
  if p_org_id is null then
    raise exception using errcode = '22023', message = 'Organización inválida';
  end if;
  select * into v_access from public.get_inventory_stock_read_context(p_org_id);
  if not found then
    raise exception using errcode = '42501', message = 'Sin acceso a la organización';
  end if;
  if not (v_access.can_read_inventory or v_access.can_read_mercadolibre) then
    raise exception using errcode = '42501', message = 'Sin permiso para consultar inventario';
  end if;
  if p_warehouse_id is not null and not public.can_access_warehouse(p_org_id, p_warehouse_id) then
    raise exception using errcode = '42501', message = 'Depósito no disponible para tu usuario';
  end if;

  with stock as materialized (
    select p.id, p.is_active, p.min_stock, p.unit_of_measure::text as unit_of_measure,
      b.quantity_available as quantity
    from public.get_inventory_stock_balances(p_org_id, null::uuid[], p_warehouse_id) b
    join public.products p on p.id = b.product_id and p.organization_id = p_org_id
  )
  select jsonb_build_object(
    'warehouseScoped', p_warehouse_id is not null,
    'canViewCosts', v_access.can_view_costs,
    'totalProducts', count(*) filter (where p_warehouse_id is null or s.quantity > 0),
    'activeProducts', count(*) filter (where s.is_active and (p_warehouse_id is null or s.quantity > 0)),
    'inactiveProducts', count(*) filter (where not s.is_active and (p_warehouse_id is null or s.quantity > 0)),
    'totalUnits', coalesce(sum(s.quantity) filter (
      where s.is_active and s.quantity > 0
        and coalesce(s.unit_of_measure, '') not in ('KG', 'LT')
    ), 0),
    'totalKg', round(coalesce(sum(s.quantity) filter (
      where s.is_active and s.quantity > 0 and s.unit_of_measure = 'KG'
    ), 0), 1),
    'totalLt', round(coalesce(sum(s.quantity) filter (
      where s.is_active and s.quantity > 0 and s.unit_of_measure = 'LT'
    ), 0), 1),
    'lowStockCount', count(*) filter (
      where s.is_active and s.quantity > 0 and s.quantity <= s.min_stock
    )
  ) || case when v_access.can_view_costs then jsonb_build_object(
    'totalStockValue', coalesce(sum(
      -- Guard inside the aggregate too: readers must not execute price lookups
      -- even if the aggregate is evaluated before the outer CASE expression.
      case when v_access.can_view_costs then s.quantity * coalesce((
        select pw.cost_price
        from public.products_with_price pw
        where pw.organization_id = p_org_id and pw.id = s.id
      ), 0) else 0 end
    ) filter (where s.is_active and s.quantity > 0), 0)
  ) else '{}'::jsonb end
  into v_result
  from stock s;

  return v_result;
end;
$$;

revoke all on function public.get_inventory_stock_metrics(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_inventory_stock_metrics(uuid, uuid)
  to authenticated, service_role;

commit;
