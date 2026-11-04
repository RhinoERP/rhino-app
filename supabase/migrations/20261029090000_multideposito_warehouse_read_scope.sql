-- Restrict the known warehouse metadata/history read paths without replacing
-- environment-specific permissive policies or changing operational writes.
-- Product-lot/movement policies and SECURITY DEFINER reports require a separate
-- audit against the target database; their base definitions are not tracked here.
begin;

create function public.has_warehouse_admin_access(p_org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = (select auth.uid()) and m.is_active
      and (m.is_owner or exists (
        select 1 from public.roles r
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        where r.id = m.role_id and r.organization_id = p_org_id
          and p.key = 'organization.admin'
      ))
  );
$$;

-- Deliberately includes inactive warehouses: authorization to read historical
-- stock is independent of permission to receive new stock in that warehouse.
-- SECURITY DEFINER avoids recursive evaluation of warehouse/assignment policies.
create function public.can_access_warehouse(p_org_id uuid, p_warehouse_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.warehouses w
    where w.id = p_warehouse_id and w.organization_id = p_org_id
      and exists (
        select 1 from public.organization_members m
        where m.organization_id = p_org_id
          and m.user_id = (select auth.uid()) and m.is_active
      )
      and (public.has_warehouse_admin_access(p_org_id) or exists (
        select 1 from public.warehouse_user_assignments a
        where a.organization_id = p_org_id
          and a.warehouse_id = p_warehouse_id
          and a.user_id = (select auth.uid())
      ))
  );
$$;

revoke all on function public.has_warehouse_admin_access(uuid)
  from public, anon, authenticated;
revoke all on function public.can_access_warehouse(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.has_warehouse_admin_access(uuid) to authenticated;
grant execute on function public.can_access_warehouse(uuid, uuid) to authenticated;

-- Restrictive policies are ANDed with existing permissive read policies. They
-- grant no new table privileges and do not authorize INSERT/UPDATE/DELETE.
create policy warehouses_assignment_read_scope
  on public.warehouses as restrictive for select to authenticated
  using (public.can_access_warehouse(organization_id, id));

create policy warehouse_assignments_self_read_scope
  on public.warehouse_user_assignments as restrictive for select to authenticated
  using (
    public.has_warehouse_admin_access(organization_id)
    or (
      user_id = (select auth.uid())
      and public.can_access_warehouse(organization_id, warehouse_id)
    )
  );

-- A transfer is a shared audit document: either endpoint grants historical
-- visibility, but a global inventory-read permission never bypasses assignments.
create policy stock_transfers_warehouse_read_scope
  on public.stock_transfers as restrictive for select to authenticated
  using (
    (
      public.has_warehouse_admin_access(organization_id)
      or exists (
        select 1 from public.organization_members m
        join public.roles r on r.id = m.role_id
          and r.organization_id = m.organization_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        where m.organization_id = stock_transfers.organization_id
          and m.user_id = (select auth.uid()) and m.is_active
          and p.key in ('inventory.read', 'inventory.read.all', 'inventory.manage')
      )
    )
    and (
      public.can_access_warehouse(organization_id, source_warehouse_id)
      or public.can_access_warehouse(organization_id, destination_warehouse_id)
    )
  );

-- Parent SELECT applies its own RLS; no child policy is consulted by the parent,
-- so the dependency is one-way and cannot recurse.
create policy stock_transfer_items_parent_read_scope
  on public.stock_transfer_items as restrictive for select to authenticated
  using (exists (
    select 1 from public.stock_transfers t
    where t.id = stock_transfer_items.transfer_id
      and t.organization_id = stock_transfer_items.organization_id
  ));

commit;
