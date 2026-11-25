begin;

-- Version the optimization already applied in the affected environment.
create or replace function public.get_current_user_warehouse_scope()
returns table (organization_id uuid, warehouse_id uuid)
language sql stable security definer set search_path = '' as $$
  with memberships as materialized (
    select m.organization_id, m.role_id, m.is_owner
    from public.organization_members m
    where m.user_id = (select auth.uid()) and m.is_active
  ), membership_access as materialized (
    select m.organization_id,
      (m.is_owner or exists (
        select 1 from public.roles r
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        where r.id = m.role_id and r.organization_id = m.organization_id
          and p.key = 'organization.admin'
      )) as is_admin
    from memberships m
  )
  select w.organization_id, w.id
  from membership_access m
  join public.warehouses w on w.organization_id = m.organization_id
  where m.is_admin or exists (
    select 1 from public.warehouse_user_assignments a
    where a.organization_id = w.organization_id
      and a.warehouse_id = w.id
      and a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.get_current_user_warehouse_scope()
  from public, anon, authenticated, service_role;
grant execute on function public.get_current_user_warehouse_scope()
  to authenticated, service_role;

alter policy product_lots_warehouse_scope on public.product_lots
  using (
    (organization_id, warehouse_id) in (
      select s.organization_id, s.warehouse_id
      from public.get_current_user_warehouse_scope() s
    )
  )
  with check (
    (organization_id, warehouse_id) in (
      select s.organization_id, s.warehouse_id
      from public.get_current_user_warehouse_scope() s
    )
  );

alter policy stock_movements_warehouse_scope on public.stock_movements
  using (
    (organization_id, warehouse_id) in (
      select s.organization_id, s.warehouse_id
      from public.get_current_user_warehouse_scope() s
    )
  )
  with check (
    (organization_id, warehouse_id) in (
      select s.organization_id, s.warehouse_id
      from public.get_current_user_warehouse_scope() s
    )
    and exists (
      select 1 from public.product_lots l
      where l.id = stock_movements.lot_id
        and l.organization_id = stock_movements.organization_id
        and l.warehouse_id = stock_movements.warehouse_id
    )
  );

create or replace function public.get_stock_health_alerts(
  p_org_id uuid,
  p_supplier_id uuid default null,
  p_slow_moving_days integer default 30
)
returns json
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_result json;
begin
  with scoped_products as materialized (
    select p.id, p.name, p.sku, p.min_stock, p.unit_of_measure
    from public.products p
    where p.organization_id = p_org_id
      and p.is_active = true
      and (p_supplier_id is null or p.supplier_id = p_supplier_id)
  ), scoped_lots as materialized (
    select pl.id, pl.product_id, pl.lot_number, pl.expiration_date,
      pl.quantity_available, pl.unit_quantity_available, pl.created_at
    from public.product_lots pl
    join scoped_products p on p.id = pl.product_id
    where pl.organization_id = p_org_id
  ), product_stock as materialized (
    select p.id, p.name, p.sku, p.min_stock, p.unit_of_measure,
      coalesce(sum(pl.quantity_available), 0) as current_stock,
      coalesce(sum(pl.unit_quantity_available), 0) as unit_stock,
      min(pl.created_at) as oldest_lot_date
    from scoped_products p
    left join scoped_lots pl on pl.product_id = p.id
    group by p.id, p.name, p.sku, p.min_stock, p.unit_of_measure
  ), critical_products as (
    select ps.id, ps.name, ps.sku, ps.min_stock, ps.current_stock,
      ps.unit_stock, ps.unit_of_measure
    from product_stock ps
    where ps.current_stock <= ps.min_stock
    order by (ps.min_stock - ps.current_stock) desc
    limit 10
  ), last_outbound as (
    select pl.product_id, max(sm.created_at) as last_movement_date
    from public.stock_movements sm
    join scoped_lots pl on pl.id = sm.lot_id
    where sm.organization_id = p_org_id and sm.type = 'OUTBOUND'
    group by pl.product_id
  ), slow_products as (
    select ps.id, ps.name, ps.sku, ps.current_stock,
      lo.last_movement_date,
      case when lo.last_movement_date is null then
        extract(day from (current_timestamp - ps.oldest_lot_date))::integer
      else
        extract(day from (current_timestamp - lo.last_movement_date))::integer
      end as days_since_movement
    from product_stock ps
    left join last_outbound lo on lo.product_id = ps.id
    where ps.current_stock > 0
      -- Preserve the existing never-sold-products rule, independent of age.
      and (lo.last_movement_date is null
        or extract(day from (current_timestamp - lo.last_movement_date)) > p_slow_moving_days)
    order by days_since_movement desc nulls first
    limit 10
  ), expiring_lots as (
    select pl.id as lot_id, pl.lot_number, pl.expiration_date,
      pl.quantity_available, pl.unit_quantity_available, pl.product_id,
      p.name as product_name, p.sku as product_sku, p.unit_of_measure,
      (pl.expiration_date::date - current_date) as days_until_expiration,
      (pl.expiration_date::date < current_date) as is_expired, pl.created_at
    from scoped_lots pl
    join scoped_products p on p.id = pl.product_id
    where pl.expiration_date is not null
      and (pl.quantity_available > 0 or pl.unit_quantity_available > 0)
    order by pl.expiration_date asc, pl.created_at asc
    limit 10
  )
  select json_build_object(
    'critical', coalesce((
      select json_agg(json_build_object(
        'id', cp.id, 'name', cp.name, 'sku', cp.sku,
        'min_stock', cp.min_stock, 'current_stock', cp.current_stock,
        'unit_stock', cp.unit_stock, 'unit_of_measure', cp.unit_of_measure
      ) order by (cp.min_stock - cp.current_stock) desc)
      from critical_products cp
    ), '[]'::json),
    'slowMoving', coalesce((
      select json_agg(json_build_object(
        'id', sp.id, 'name', sp.name, 'sku', sp.sku,
        'current_stock', sp.current_stock,
        'last_movement_date', sp.last_movement_date,
        'days_since_movement', sp.days_since_movement
      ) order by sp.days_since_movement desc nulls first)
      from slow_products sp
    ), '[]'::json),
    'expiringLots', coalesce((
      select json_agg(json_build_object(
        'lot_id', el.lot_id, 'lot_number', el.lot_number,
        'expiration_date', el.expiration_date,
        'quantity_available', el.quantity_available,
        'unit_quantity_available', el.unit_quantity_available,
        'product_id', el.product_id, 'product_name', el.product_name,
        'product_sku', el.product_sku, 'unit_of_measure', el.unit_of_measure,
        'days_until_expiration', el.days_until_expiration,
        'is_expired', el.is_expired
      ) order by el.expiration_date asc, el.created_at asc)
      from expiring_lots el
    ), '[]'::json)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_stock_health_alerts(uuid, uuid, integer)
  from public, anon;
grant execute on function public.get_stock_health_alerts(uuid, uuid, integer)
  to authenticated, service_role;

commit;
