alter table public.pos_sale_taxes enable row level security;

drop policy if exists "pos_sale_taxes_select_org_members"
on public.pos_sale_taxes;

drop policy if exists "pos_sale_taxes_insert_org_members"
on public.pos_sale_taxes;

drop policy if exists "pos_sale_taxes_update_org_members"
on public.pos_sale_taxes;

drop policy if exists "pos_sale_taxes_delete_org_members"
on public.pos_sale_taxes;

create policy "pos_sale_taxes_select_org_members"
on public.pos_sale_taxes
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = pos_sale_taxes.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
  )
);

create policy "pos_sale_taxes_insert_org_members"
on public.pos_sale_taxes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = pos_sale_taxes.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
  )
  and exists (
    select 1
    from public.pos_sales ps
    where ps.id = pos_sale_taxes.pos_sale_id
      and ps.organization_id = pos_sale_taxes.organization_id
  )
);

create policy "pos_sale_taxes_update_org_members"
on public.pos_sale_taxes
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = pos_sale_taxes.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = pos_sale_taxes.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
  )
  and exists (
    select 1
    from public.pos_sales ps
    where ps.id = pos_sale_taxes.pos_sale_id
      and ps.organization_id = pos_sale_taxes.organization_id
  )
);

create policy "pos_sale_taxes_delete_org_members"
on public.pos_sale_taxes
for delete
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = pos_sale_taxes.organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
  )
);
