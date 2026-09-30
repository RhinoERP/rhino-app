create table if not exists public.purchase_order_item_taxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  tax_id uuid references public.taxes(id) on delete set null,
  name text not null,
  rate numeric not null default 0,
  base_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  tax_code_snapshot text,
  source text not null default 'product',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_item_taxes_source_check
    check (source in ('product', 'manual', 'fallback', 'legacy_prorated')),
  constraint purchase_order_item_taxes_amounts_check
    check (rate >= 0 and rate <= 1000 and base_amount >= 0 and tax_amount >= 0)
);

create index if not exists purchase_order_item_taxes_order_idx on public.purchase_order_item_taxes(purchase_order_id);
create index if not exists purchase_order_item_taxes_item_idx on public.purchase_order_item_taxes(purchase_order_item_id);

alter table public.purchase_order_taxes add column if not exists tax_code_snapshot text;
alter table public.purchase_order_taxes alter column tax_id drop not null;
alter table public.purchase_order_taxes drop constraint if exists purchase_order_taxes_tax_fkey;
alter table public.purchase_order_taxes add constraint purchase_order_taxes_tax_fkey
  foreign key (tax_id) references public.taxes(id) on delete set null;
alter table public.purchase_orders add column if not exists fallback_taxes jsonb not null default '[]'::jsonb;
alter table public.purchase_orders add column if not exists tax_snapshot_initialized boolean not null default false;
alter table public.purchase_order_items add column if not exists tax_override jsonb;

alter table public.purchase_order_item_taxes enable row level security;

create or replace function public.purchase_item_tax_access(p_org_id uuid, p_write boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members om
    left join public.role_permissions rp on rp.role_id = om.role_id
    left join public.permissions p on p.id = rp.permission_id
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and (om.is_owner = true or p.key = 'organization.admin'
        or (p_write and p.key in ('purchases.manage', 'purchases.manage.all'))
        or (not p_write and p.key in (
          'purchases.read', 'purchases.read.all', 'purchases.manage', 'purchases.manage.all'
        )))
  );
$$;

revoke all on function public.purchase_item_tax_access(uuid, boolean) from public, anon;
grant execute on function public.purchase_item_tax_access(uuid, boolean)
to authenticated, service_role;

create or replace function public.validate_purchase_item_tax_relations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.purchase_order_items poi
    join public.purchase_orders po on po.id = poi.purchase_order_id
    where poi.id = new.purchase_order_item_id
      and poi.purchase_order_id = new.purchase_order_id
      and poi.organization_id = new.organization_id
      and po.organization_id = new.organization_id
      and (new.product_id is null or poi.product_id = new.product_id)
  ) then
    raise exception 'El ítem debe pertenecer a la orden y organización de la compra';
  end if;

  if new.product_id is not null and not exists (
    select 1 from public.products p
    where p.id = new.product_id and p.organization_id = new.organization_id
  ) then
    raise exception 'El producto del impuesto no pertenece a la organización';
  end if;

  if new.tax_id is not null and not exists (
    select 1 from public.taxes t
    where t.id = new.tax_id and t.organization_id = new.organization_id
  ) then
    raise exception 'El impuesto no pertenece a la organización';
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from public.purchase_order_item_taxes pit
    left join public.purchase_order_items poi on poi.id = pit.purchase_order_item_id
    left join public.purchase_orders po on po.id = pit.purchase_order_id
    left join public.products p on p.id = pit.product_id
    left join public.taxes t on t.id = pit.tax_id
    where poi.id is null or po.id is null
      or poi.purchase_order_id <> pit.purchase_order_id
      or poi.organization_id <> pit.organization_id
      or po.organization_id <> pit.organization_id
      or (pit.product_id is not null and
        (p.id is null or p.organization_id <> pit.organization_id
         or poi.product_id <> pit.product_id))
      or (pit.tax_id is not null and
        (t.id is null or t.organization_id <> pit.organization_id))
  ) then
    raise exception 'Hay impuestos por ítem de compra con relaciones entre organizaciones inválidas';
  end if;
end;
$$;

drop trigger if exists validate_purchase_item_tax_relations on public.purchase_order_item_taxes;
create trigger validate_purchase_item_tax_relations
before insert or update of organization_id, purchase_order_id, purchase_order_item_id, product_id, tax_id
on public.purchase_order_item_taxes for each row
execute function public.validate_purchase_item_tax_relations();

drop policy if exists "Organization members can manage purchase order item taxes"
on public.purchase_order_item_taxes;
drop policy if exists purchase_item_taxes_read on public.purchase_order_item_taxes;
drop policy if exists purchase_item_taxes_insert on public.purchase_order_item_taxes;
drop policy if exists purchase_item_taxes_update on public.purchase_order_item_taxes;
drop policy if exists purchase_item_taxes_delete on public.purchase_order_item_taxes;

create policy purchase_item_taxes_read on public.purchase_order_item_taxes
for select using (
  public.purchase_item_tax_access(organization_id, false)
  and exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_id and po.organization_id = organization_id
  )
);
create policy purchase_item_taxes_insert on public.purchase_order_item_taxes
for insert with check (public.purchase_item_tax_access(organization_id, true));
create policy purchase_item_taxes_update on public.purchase_order_item_taxes
for update using (public.purchase_item_tax_access(organization_id, true))
with check (public.purchase_item_tax_access(organization_id, true));
create policy purchase_item_taxes_delete on public.purchase_order_item_taxes
for delete using (public.purchase_item_tax_access(organization_id, true));
