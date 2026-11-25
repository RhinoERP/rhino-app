-- Transfers move both measured quantity and physical units in one transaction.
-- Do not expose the RPC to authenticated users until all stock consumers filter
-- by warehouse; service_role can use it for integration verification meanwhile.

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  source_warehouse_id uuid not null,
  destination_warehouse_id uuid not null,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (source_warehouse_id <> destination_warehouse_id),
  unique (id, organization_id),
  foreign key (source_warehouse_id, organization_id)
    references public.warehouses(id, organization_id),
  foreign key (destination_warehouse_id, organization_id)
    references public.warehouses(id, organization_id)
);

create table public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  transfer_id uuid not null,
  product_id uuid not null references public.products(id),
  product_variant_id uuid references public.product_variants(id),
  source_lot_id uuid not null references public.product_lots(id),
  destination_lot_id uuid not null references public.product_lots(id),
  quantity numeric not null check (quantity > 0),
  unit_quantity numeric not null default 0 check (unit_quantity >= 0),
  unique (transfer_id, source_lot_id),
  foreign key (transfer_id, organization_id)
    references public.stock_transfers(id, organization_id)
);

alter table public.stock_movements
  add column transfer_id uuid references public.stock_transfers(id);
create index stock_movements_transfer on public.stock_movements (transfer_id)
  where transfer_id is not null;

alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_items enable row level security;
create policy stock_transfers_read on public.stock_transfers for select to authenticated
  using (exists (
    select 1 from public.organization_members m
    where m.organization_id = stock_transfers.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));
create policy stock_transfer_items_read on public.stock_transfer_items for select to authenticated
  using (exists (
    select 1 from public.organization_members m
    where m.organization_id = stock_transfer_items.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));
grant select on public.stock_transfers, public.stock_transfer_items to authenticated;

create function public.create_stock_transfer(
  p_organization_id uuid, p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid, p_items jsonb, p_reason text,
  p_actor_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_transfer_id uuid;
  v_source public.product_lots%rowtype;
  v_destination public.product_lots%rowtype;
  v_product public.products%rowtype;
  v_entry record;
  v_quantity numeric;
  v_units numeric;
  v_source_stock numeric;
  v_destination_stock numeric;
  v_source_units numeric;
  v_destination_units numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'La transferencia requiere un servicio autorizado';
  end if;
  if p_organization_id is null or p_source_warehouse_id is null
    or p_destination_warehouse_id is null or p_actor_id is null
    or p_source_warehouse_id = p_destination_warehouse_id
    or coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Transferencia inválida';
  end if;
  if not exists (select 1 from public.organization_members m
      where m.organization_id = p_organization_id
        and m.user_id = p_actor_id and m.is_active
        and (m.is_owner or exists (
          select 1 from public.role_permissions rp
          join public.permissions p on p.id = rp.permission_id
          where rp.role_id = m.role_id and p.key in (
            'inventory.manage', 'organization.admin'
          )
        ))) then
    raise exception 'El usuario no puede transferir stock';
  end if;
  if not exists (select 1 from public.warehouses w
      where w.id = p_source_warehouse_id and w.organization_id = p_organization_id)
    or not exists (select 1 from public.warehouses w
      where w.id = p_destination_warehouse_id
        and w.organization_id = p_organization_id and w.is_active) then
    raise exception 'Depósito origen o destino inválido';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
      where nullif(e->>'source_lot_id', '') is null
        or nullif(e->>'quantity', '') is null)
    or exists (select 1 from jsonb_array_elements(p_items) e
      group by e->>'source_lot_id' having count(*) > 1) then
    raise exception 'Los lotes de origen deben ser únicos e identificados';
  end if;

  insert into public.stock_transfers (
    organization_id, source_warehouse_id, destination_warehouse_id,
    reason, created_by
  ) values (
    p_organization_id, p_source_warehouse_id, p_destination_warehouse_id,
    nullif(btrim(p_reason), ''), p_actor_id
  ) returning id into v_transfer_id;

  for v_entry in select value from jsonb_array_elements(p_items)
      order by value->>'source_lot_id' loop
    v_quantity := (v_entry.value->>'quantity')::numeric;
    v_units := coalesce((v_entry.value->>'unit_quantity')::numeric, 0);
    if v_quantity is null or v_quantity <= 0 or v_units < 0 then
      raise exception 'Cantidad a transferir inválida';
    end if;
    select * into v_source from public.product_lots
      where id = (v_entry.value->>'source_lot_id')::uuid
        and organization_id = p_organization_id
        and warehouse_id = p_source_warehouse_id for update;
    if not found then raise exception 'Lote de origen no encontrado'; end if;
    select * into v_product from public.products
      where id = v_source.product_id and organization_id = p_organization_id;
    if not found then raise exception 'Producto ajeno a la organización'; end if;
    if v_source.quantity_available < v_quantity
      or coalesce(v_source.unit_quantity_available, 0) < v_units then
      raise exception 'Stock insuficiente en el depósito de origen';
    end if;
    if v_product.unit_of_measure in ('KG', 'LT') and v_product.tracks_stock_units
      and v_units <= 0 then
      raise exception 'La transferencia requiere cantidad de piezas';
    end if;
    if not (v_product.unit_of_measure in ('KG', 'LT') and v_product.tracks_stock_units)
      and v_units <> 0 then
      raise exception 'El producto no registra piezas por separado';
    end if;
    -- Serialize creation of a destination balance even when no row exists yet.
    perform pg_advisory_xact_lock(hashtextextended(
      p_organization_id::text || ':' || p_destination_warehouse_id::text || ':' ||
      v_source.product_id::text || ':' || coalesce(v_source.product_variant_id::text, '') || ':' ||
      v_source.lot_number || ':' || coalesce(v_source.expiration_date::text, ''), 0
    ));
    if (select count(*) from public.product_lots
        where organization_id = p_organization_id
          and warehouse_id = p_destination_warehouse_id
          and product_id = v_source.product_id
          and product_variant_id is not distinct from v_source.product_variant_id
          and lot_number = v_source.lot_number
          and expiration_date is not distinct from v_source.expiration_date) > 1 then
      raise exception 'Hay varios saldos de destino para el mismo lote';
    end if;
    select * into v_destination from public.product_lots
      where organization_id = p_organization_id
        and warehouse_id = p_destination_warehouse_id
        and product_id = v_source.product_id
        and product_variant_id is not distinct from v_source.product_variant_id
        and lot_number = v_source.lot_number
        and expiration_date is not distinct from v_source.expiration_date
      order by id for update;
    if not found then
      insert into public.product_lots (
        organization_id, warehouse_id, product_id, product_variant_id,
        lot_number, expiration_date, quantity_available, unit_quantity_available
      ) values (
        p_organization_id, p_destination_warehouse_id, v_source.product_id,
        v_source.product_variant_id, v_source.lot_number,
        v_source.expiration_date, 0, 0
      ) returning * into v_destination;
    end if;
    v_source_stock := v_source.quantity_available;
    v_destination_stock := v_destination.quantity_available;
    v_source_units := coalesce(v_source.unit_quantity_available, 0);
    v_destination_units := coalesce(v_destination.unit_quantity_available, 0);
    update public.product_lots set
      quantity_available = v_source_stock - v_quantity,
      unit_quantity_available = v_source_units - v_units, updated_at = now()
      where id = v_source.id;
    update public.product_lots set
      quantity_available = v_destination_stock + v_quantity,
      unit_quantity_available = v_destination_units + v_units, updated_at = now()
      where id = v_destination.id;
    insert into public.stock_transfer_items (
      organization_id, transfer_id, product_id, product_variant_id,
      source_lot_id, destination_lot_id, quantity, unit_quantity
    ) values (
      p_organization_id, v_transfer_id, v_source.product_id,
      v_source.product_variant_id, v_source.id, v_destination.id,
      v_quantity, v_units
    );
    insert into public.stock_movements (
      organization_id, warehouse_id, lot_id, type, quantity,
      previous_stock, new_stock, unit_quantity, reason, created_by, transfer_id
    ) values
      (p_organization_id, p_source_warehouse_id, v_source.id, 'TRANSFER',
       v_quantity, v_source_stock, v_source_stock - v_quantity,
       -v_units, 'Transferencia saliente', p_actor_id, v_transfer_id),
      (p_organization_id, p_destination_warehouse_id, v_destination.id, 'TRANSFER',
       v_quantity, v_destination_stock, v_destination_stock + v_quantity,
       v_units, 'Transferencia entrante', p_actor_id, v_transfer_id);
  end loop;
  return v_transfer_id;
end;
$$;
revoke all on function public.create_stock_transfer(uuid, uuid, uuid, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_stock_transfer(uuid, uuid, uuid, jsonb, text, uuid)
  to service_role;
