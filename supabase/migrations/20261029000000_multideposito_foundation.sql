-- Phase 1: create the default warehouse and attach existing balances/history.
-- Keep legacy writers working until every stock consumer is warehouse-aware.

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  code text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  wholesale_enabled boolean not null default true,
  direct_sale_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index warehouses_one_default_per_org
  on public.warehouses (organization_id) where is_default;
create index warehouses_org_active on public.warehouses (organization_id, is_active);

insert into public.warehouses (organization_id, name, is_default)
select id, 'Depósito principal', true from public.organizations;

create function public.create_default_warehouse_for_organization()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.warehouses (organization_id, name, is_default)
  values (new.id, 'Depósito principal', true);
  return new;
end;
$$;

create trigger create_default_warehouse_on_organization
  after insert on public.organizations for each row
  execute function public.create_default_warehouse_for_organization();

create table public.warehouse_user_assignments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, warehouse_id, user_id),
  foreign key (warehouse_id, organization_id)
    references public.warehouses(id, organization_id) on delete cascade,
  foreign key (user_id, organization_id)
    references public.organization_members(user_id, organization_id) on delete cascade
);
create index warehouse_user_assignments_user
  on public.warehouse_user_assignments (organization_id, user_id);

alter table public.product_lots
  add column warehouse_id uuid,
  add column product_variant_id uuid;

update public.product_lots pl
set warehouse_id = w.id
from public.warehouses w
where w.organization_id = pl.organization_id and w.is_default;

-- The catalog variant stays unique; its current lot becomes its first balance.
update public.product_lots pl
set product_variant_id = pv.id
from public.product_variants pv
where pv.lot_id = pl.id and pv.organization_id = pl.organization_id
  and pv.product_id = pl.product_id;

-- A catalog variant may legitimately have no stock lot yet. Give it an empty
-- DEFAULT balance in the principal warehouse, without assigning any existing
-- unlinked product stock to a size/color arbitrarily. Keep lot_id populated
-- for legacy consumers until all of them are migrated.
with created as (
  insert into public.product_lots (
    organization_id, product_id, warehouse_id, product_variant_id,
    lot_number, expiration_date, quantity_available, unit_quantity_available
  )
  select pv.organization_id, pv.product_id, w.id, pv.id,
    'DEFAULT', null, 0, 0
  from public.product_variants pv
  join public.warehouses w on w.organization_id = pv.organization_id
    and w.is_default
  where pv.lot_id is null
  returning id, product_variant_id
)
update public.product_variants pv
set lot_id = created.id
from created
where pv.id = created.product_variant_id;

do $$
begin
  if exists (
    select 1 from public.product_variants pv
    left join public.product_lots pl on pl.id = pv.lot_id
      and pl.organization_id = pv.organization_id
      and pl.product_id = pv.product_id and pl.product_variant_id = pv.id
    where pl.id is null
  ) then
    raise exception 'Multidepósito: existen variantes sin lote propio válido';
  end if;
end;
$$;

alter table public.product_lots
  alter column warehouse_id set not null,
  add constraint product_lots_warehouse_org_fk
    foreign key (warehouse_id, organization_id)
    references public.warehouses(id, organization_id),
  add constraint product_lots_variant_fk
    foreign key (product_variant_id) references public.product_variants(id);

create index product_lots_warehouse_product_variant
  on public.product_lots (organization_id, warehouse_id, product_id, product_variant_id);

-- Both existing code paths and the atomic purchase RPC still create lots without
-- a warehouse. Assign only those legacy writes to the default until cutover.
create function public.default_product_lot_warehouse()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.warehouse_id is null then
    select id into new.warehouse_id from public.warehouses
    where organization_id = new.organization_id and is_default;
    if new.warehouse_id is null then
      raise exception 'La organización no tiene depósito principal';
    end if;
  end if;
  return new;
end;
$$;

create trigger default_product_lot_warehouse_on_insert
  before insert on public.product_lots for each row
  execute function public.default_product_lot_warehouse();

alter table public.stock_movements add column warehouse_id uuid;
update public.stock_movements sm
set warehouse_id = pl.warehouse_id
from public.product_lots pl
where sm.lot_id = pl.id and sm.organization_id = pl.organization_id;

-- Historical movements whose lot was removed still belong to the original
-- single-warehouse organization before this migration.
update public.stock_movements sm
set warehouse_id = w.id
from public.warehouses w
where sm.warehouse_id is null
  and w.organization_id = sm.organization_id and w.is_default;

alter table public.stock_movements
  alter column warehouse_id set not null,
  add constraint stock_movements_warehouse_org_fk
    foreign key (warehouse_id, organization_id)
    references public.warehouses(id, organization_id);
create index stock_movements_warehouse_created
  on public.stock_movements (organization_id, warehouse_id, created_at);

do $$
begin
  if exists (
    select 1 from public.organizations o
    left join public.warehouses w on w.organization_id = o.id and w.is_default
    where w.id is null
  ) then
    raise exception 'Multidepósito: hay organizaciones sin depósito principal';
  end if;
end;
$$;

create function public.assign_stock_movement_warehouse()
returns trigger language plpgsql set search_path = public as $$
declare
  v_lot_warehouse_id uuid;
begin
  select warehouse_id into v_lot_warehouse_id from public.product_lots
  where id = new.lot_id and organization_id = new.organization_id;
  if v_lot_warehouse_id is null then
    raise exception 'El movimiento requiere un lote de la misma organización';
  end if;
  if new.warehouse_id is not null and new.warehouse_id <> v_lot_warehouse_id then
    raise exception 'El depósito del movimiento difiere del depósito del lote';
  end if;
  new.warehouse_id := v_lot_warehouse_id;
  return new;
end;
$$;

create trigger assign_stock_movement_warehouse_on_insert
  before insert on public.stock_movements for each row
  execute function public.assign_stock_movement_warehouse();

alter table public.warehouses enable row level security;
alter table public.warehouse_user_assignments enable row level security;
create policy warehouses_read on public.warehouses for select to authenticated
  using (exists (
    select 1 from public.organization_members m
    where m.organization_id = warehouses.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));
create policy warehouse_user_assignments_read on public.warehouse_user_assignments
  for select to authenticated using (exists (
    select 1 from public.organization_members m
    where m.organization_id = warehouse_user_assignments.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));
grant select on public.warehouses, public.warehouse_user_assignments to authenticated;
