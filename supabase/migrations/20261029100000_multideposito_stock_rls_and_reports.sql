-- Based on the target database's effective policies/view/RPC definitions.
-- Preserve business RPC bodies and receipt/reentry transactions; enforce the
-- caller's warehouse scope at the underlying rows and report execution boundary.
begin;

-- Ordinary members cannot SELECT role_permissions under the existing RLS.
-- Evaluate only the current user's inventory permission in a bounded definer
-- helper instead of joining that protected table inside the transfer policy.
create function public.has_warehouse_inventory_read_access(p_org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_warehouse_admin_access(p_org_id) or exists (
    select 1 from public.organization_members m
    join public.roles r on r.id = m.role_id
      and r.organization_id = m.organization_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where m.organization_id = p_org_id
      and m.user_id = (select auth.uid()) and m.is_active
      and p.key in ('inventory.read', 'inventory.read.all', 'inventory.manage')
  );
$$;
revoke all on function public.has_warehouse_inventory_read_access(uuid)
  from public, anon, authenticated;
grant execute on function public.has_warehouse_inventory_read_access(uuid)
  to authenticated;

alter policy stock_transfers_warehouse_read_scope on public.stock_transfers
  using (
    public.has_warehouse_inventory_read_access(organization_id)
    and (
      public.can_access_warehouse(organization_id, source_warehouse_id)
      or public.can_access_warehouse(organization_id, destination_warehouse_id)
    )
  );

-- The old permissive ALL policies check membership only (not is_active and not
-- assignment). Restrictive ALL policies bound SELECT and direct DML to the same
-- warehouse. WITH CHECK also covers INSERT and an UPDATE's proposed destination.
-- Inactive warehouses remain readable for history/draining; operational RPCs
-- keep their existing active-destination/module/channel validations.
alter table public.product_lots enable row level security;
alter table public.stock_movements enable row level security;

create policy product_lots_warehouse_scope
  on public.product_lots as restrictive for all to authenticated
  using (public.can_access_warehouse(organization_id, warehouse_id))
  with check (public.can_access_warehouse(organization_id, warehouse_id));

create policy stock_movements_warehouse_scope
  on public.stock_movements as restrictive for all to authenticated
  using (public.can_access_warehouse(organization_id, warehouse_id))
  with check (
    public.can_access_warehouse(organization_id, warehouse_id)
    and exists (
      select 1 from public.product_lots l
      where l.id = stock_movements.lot_id
        and l.organization_id = stock_movements.organization_id
        and l.warehouse_id = stock_movements.warehouse_id
    )
  );

-- Remove anonymous/inherited public table privileges. Preserve the authenticated
-- DML paths currently used by wholesale/POS services, now bounded by RLS.
revoke all on public.product_lots, public.stock_movements from public, anon;
grant select, insert, update, delete on public.product_lots, public.stock_movements
  to authenticated, service_role;

-- The original postgres-owned view bypasses base-table RLS. Keep its columns,
-- pricing and aggregation unchanged, but evaluate underlying reads as caller.
alter view public.view_stock_detail set (security_invoker = true);
revoke all on public.view_stock_detail from public, anon, authenticated;
grant select on public.view_stock_detail to authenticated, service_role;

-- These existing reports sum current balances (so TRANSFER has no net effect).
-- Invoker execution makes their lot/movement reads obey warehouse RLS, and their
-- other business-table reads obey those tables' own policies as well.
-- Keep signatures, defaults and JSON shapes intact. service_role grants remain.
alter function public.get_stock_health_alerts(uuid, uuid, integer)
  security invoker;
alter function public.get_stock_health_alerts(uuid, uuid, integer)
  set search_path = public, pg_temp;
revoke all on function public.get_stock_health_alerts(uuid, uuid, integer)
  from public, anon;
grant execute on function public.get_stock_health_alerts(uuid, uuid, integer)
  to authenticated, service_role;

alter function public.get_control_tower_kpis(uuid, date, date, uuid, uuid)
  security invoker;
alter function public.get_control_tower_kpis(uuid, date, date, uuid, uuid)
  set search_path = public, pg_temp;
revoke all on function public.get_control_tower_kpis(uuid, date, date, uuid, uuid)
  from public, anon;
grant execute on function public.get_control_tower_kpis(uuid, date, date, uuid, uuid)
  to authenticated, service_role;

-- Activity counts are not commercial stock flow; counting both transfer legs is
-- intentional audit activity. Keep its invoker body and aggregate keys unchanged.
alter function public.get_org_activity_metrics(text)
  set search_path = public, pg_temp;
revoke all on function public.get_org_activity_metrics(text) from public, anon;
grant execute on function public.get_org_activity_metrics(text)
  to authenticated, service_role;

commit;
