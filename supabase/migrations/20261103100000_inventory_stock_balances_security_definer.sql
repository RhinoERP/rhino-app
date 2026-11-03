begin;

-- CREATE OR REPLACE preserves the existing owner. Refuse a rollout that cannot
-- bypass table RLS: otherwise the original per-row policy cost would remain.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    cross join pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = 'public.get_inventory_stock_balances(uuid,uuid[],uuid)'::regprocedure
      and c.oid in ('public.products'::regclass, 'public.product_variants'::regclass,
        'public.product_lots'::regclass)
      and not (r.rolsuper or r.rolbypassrls or
        (c.relowner = p.proowner and not c.relforcerowsecurity))
  ) then
    raise exception 'Stock balances owner cannot bypass RLS; review production preflight';
  end if;
end;
$$;

-- Shared gate for balances and metrics. The invoker helper is_org_active runs
-- with this definer's privileges; NULL/missing organizations yield no context.
create or replace function public.get_inventory_stock_read_context(p_org_id uuid)
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
    and public.is_org_active(p_org_id)
  group by m.is_owner;
$$;

revoke all on function public.get_inventory_stock_read_context(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_inventory_stock_read_context(uuid)
  to authenticated, service_role;

-- This bulk read deliberately bypasses table RLS. Its explicit predicates are
-- the authorization boundary: active organization/membership and read permission,
-- organization/product isolation, MELI-only access, warehouse assignments and
-- active variants. Review this function whenever those table policies change.
-- Reuse the same warehouse helper as product_lots_warehouse_scope, once per call.
create or replace function public.get_inventory_stock_balances(
  p_org_id uuid,
  p_product_ids uuid[],
  p_warehouse_id uuid default null
)
returns table (product_id uuid, quantity_available numeric, unit_quantity_available numeric)
language plpgsql stable security definer set search_path = ''
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
  with warehouse_scope as materialized (
    select s.warehouse_id
    from public.get_current_user_warehouse_scope() s
    where s.organization_id = p_org_id
  ), scoped_products as materialized (
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
      and pl.warehouse_id in (select s.warehouse_id from warehouse_scope s)
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

-- Fail atomically if the access boundary or its execution configuration differs.
do $$
declare
  v_function record;
  v_context record;
begin
  select p.prosecdef, p.proconfig into strict v_context
  from pg_catalog.pg_proc p
  where p.oid = 'public.get_inventory_stock_read_context(uuid)'::regprocedure;
  if not v_context.prosecdef
    or not coalesce('search_path=""' = any(v_context.proconfig), false)
  then
    raise exception 'Invalid stock read context execution configuration';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.get_inventory_stock_read_context(uuid)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.get_inventory_stock_read_context(uuid)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.get_inventory_stock_read_context(uuid)', 'EXECUTE')
  then
    raise exception 'Invalid stock read context execution grants';
  end if;
  select p.prosecdef, p.proconfig into strict v_function
  from pg_catalog.pg_proc p
  where p.oid = 'public.get_inventory_stock_balances(uuid,uuid[],uuid)'::regprocedure;
  if not v_function.prosecdef
    or not coalesce('search_path=""' = any(v_function.proconfig), false)
    or not coalesce('plan_cache_mode=force_custom_plan' = any(v_function.proconfig), false)
  then
    raise exception 'Invalid stock balances execution configuration';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.get_inventory_stock_balances(uuid,uuid[],uuid)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.get_inventory_stock_balances(uuid,uuid[],uuid)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.get_inventory_stock_balances(uuid,uuid[],uuid)', 'EXECUTE')
  then
    raise exception 'Invalid stock balances execution grants';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
