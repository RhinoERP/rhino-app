-- Stock maintenance: permissions, location, row locking, balance change and
-- audit entry are checked together. These functions do not change sales timing.
begin;

create function public.assert_inventory_warehouse_access(
  p_org_id uuid, p_warehouse_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_member public.organization_members%rowtype;
  v_admin boolean;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado'; end if;
  select * into v_member from public.organization_members
    where organization_id = p_org_id and user_id = auth.uid() and is_active
    for share;
  if not found then raise exception 'Sin acceso a la organización'; end if;

  v_admin := v_member.is_owner or exists (
    select 1 from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions permission on permission.id = rp.permission_id
    where r.id = v_member.role_id and r.organization_id = p_org_id
      and permission.key = 'organization.admin'
  );
  if not v_admin and not exists (
    select 1 from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions permission on permission.id = rp.permission_id
    where r.id = v_member.role_id and r.organization_id = p_org_id
      and permission.key = 'inventory.manage'
  ) then
    raise exception 'Sin permiso para gestionar inventario';
  end if;

  -- Lock membership, warehouse and assignment rows so warehouse deactivation
  -- or assignment revocation cannot race this movement's stock write.
  perform 1 from public.warehouses
    where id = p_warehouse_id and organization_id = p_org_id and is_active
    for share;
  if not found then raise exception 'Depósito inactivo o ajeno a la organización'; end if;
  if not v_admin then
    perform 1 from public.warehouse_user_assignments
      where organization_id = p_org_id and warehouse_id = p_warehouse_id
        and user_id = auth.uid() for share;
    if not found then raise exception 'El depósito no está asignado a tu usuario'; end if;
  end if;
end;
$$;

create function public.apply_warehouse_stock_movement(
  p_org_id uuid, p_warehouse_id uuid, p_product_id uuid, p_lot_id uuid,
  p_type public.stock_movement_type, p_quantity numeric,
  p_unit_quantity numeric default null, p_reason text default null,
  p_source text default 'MANUAL'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_product public.products%rowtype;
  v_lot public.product_lots%rowtype;
  v_tracks_units boolean;
  v_quantity_delta numeric;
  v_unit_delta numeric := 0;
  v_previous_units numeric;
  v_new_stock numeric;
  v_new_units numeric;
  v_movement_id uuid;
begin
  perform public.assert_inventory_warehouse_access(p_org_id, p_warehouse_id);
  if p_type is null or p_type::text not in ('INBOUND', 'OUTBOUND', 'ADJUSTMENT')
    or p_source is null or p_source not in ('MANUAL', 'IMPORT') then
    raise exception 'Tipo u origen de movimiento no permitido';
  end if;
  if p_quantity is null or p_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or (p_unit_quantity is not null
      and p_unit_quantity::text in ('NaN', 'Infinity', '-Infinity')) then
    raise exception 'Cantidad de movimiento inválida';
  end if;
  if p_type::text in ('INBOUND', 'OUTBOUND') and p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  select * into v_product from public.products
    where id = p_product_id and organization_id = p_org_id;
  if not found then raise exception 'Producto ajeno a la organización'; end if;
  select * into v_lot from public.product_lots
    where id = p_lot_id and organization_id = p_org_id
      and warehouse_id = p_warehouse_id and product_id = p_product_id for update;
  if not found then raise exception 'El lote no pertenece al producto y depósito seleccionados'; end if;

  if v_product.has_variants then
    if trunc(p_quantity) <> p_quantity or not exists (
      select 1 from public.product_variants pv
      where pv.id = v_lot.product_variant_id and pv.product_id = p_product_id
        and pv.organization_id = p_org_id
    ) then
      raise exception 'El ajuste requiere una variante válida y cantidades enteras';
    end if;
  elsif v_lot.product_variant_id is not null then
    raise exception 'El lote tiene una variante incompatible con el producto';
  end if;

  v_tracks_units := coalesce(v_product.unit_of_measure in ('KG', 'LT'), false)
    and coalesce(v_product.tracks_stock_units, false);
  v_quantity_delta := case when p_type::text = 'OUTBOUND'
    then -p_quantity else p_quantity end;
  if v_tracks_units then
    if p_type::text in ('INBOUND', 'OUTBOUND')
      and (p_unit_quantity is null or p_unit_quantity <= 0) then
      raise exception 'Ingresá las piezas para registrar el movimiento';
    end if;
    v_unit_delta := case when p_type::text = 'OUTBOUND'
      then -coalesce(p_unit_quantity, 0) else coalesce(p_unit_quantity, 0) end;
  elsif coalesce(p_unit_quantity, 0) <> 0 then
    raise exception 'El producto no registra piezas por separado';
  end if;
  if v_quantity_delta = 0 and v_unit_delta = 0 then
    raise exception 'El ajuste no modifica el stock';
  end if;
  v_previous_units := coalesce(v_lot.unit_quantity_available, 0);
  v_new_stock := v_lot.quantity_available + v_quantity_delta;
  v_new_units := v_previous_units + v_unit_delta;
  if v_new_stock < 0 or (v_tracks_units and v_new_units < 0) then
    raise exception 'Stock insuficiente en el lote del depósito seleccionado';
  end if;

  update public.product_lots set quantity_available = v_new_stock,
    unit_quantity_available = case when v_tracks_units then v_new_units
      else v_lot.unit_quantity_available end,
    updated_at = now()
    where id = v_lot.id and organization_id = p_org_id;
  insert into public.stock_movements (
    organization_id, warehouse_id, lot_id, type, quantity, previous_stock,
    new_stock, unit_quantity, reason, created_by, source
  ) values (
    p_org_id, p_warehouse_id, v_lot.id, p_type, abs(v_quantity_delta),
    v_lot.quantity_available, v_new_stock,
    case when v_tracks_units then nullif(v_unit_delta, 0) else null end,
    nullif(btrim(p_reason), ''), auth.uid(), p_source
  ) returning id into v_movement_id;
  return v_movement_id;
end;
$$;

-- Absolute balance used by stock imports and physical-count corrections.
-- A repeated target produces no extra movement. Existing lots are matched by
-- the complete commercial identity, or by an explicit lot ID if ambiguous.
create function public.set_warehouse_stock_balance(
  p_org_id uuid, p_warehouse_id uuid, p_product_id uuid, p_quantity numeric,
  p_unit_quantity numeric default null, p_product_variant_id uuid default null,
  p_lot_number text default 'DEFAULT', p_expiration_date date default null,
  p_lot_id uuid default null, p_reason text default 'Importación de stock',
  p_source text default 'IMPORT'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_product public.products%rowtype;
  v_lot public.product_lots%rowtype;
  v_lot_number text := btrim(p_lot_number);
  v_candidate_count bigint;
  v_created boolean := false;
  v_tracks_units boolean;
  v_target_units numeric;
  v_quantity_delta numeric;
  v_unit_delta numeric;
  v_movement_type public.stock_movement_type;
begin
  perform public.assert_inventory_warehouse_access(p_org_id, p_warehouse_id);
  if p_source is null or p_source not in ('MANUAL', 'IMPORT') then
    raise exception 'Origen de ajuste no permitido';
  end if;
  if p_quantity is null or p_quantity < 0
    or p_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or (p_unit_quantity is not null and (p_unit_quantity < 0
      or p_unit_quantity::text in ('NaN', 'Infinity', '-Infinity')))
    or nullif(v_lot_number, '') is null then
    raise exception 'Saldo objetivo o número de lote inválido';
  end if;
  select * into v_product from public.products
    where id = p_product_id and organization_id = p_org_id;
  if not found then raise exception 'Producto ajeno a la organización'; end if;
  if v_product.has_variants then
    if trunc(p_quantity) <> p_quantity or not exists (
      select 1 from public.product_variants pv
      where pv.id = p_product_variant_id and pv.organization_id = p_org_id
        and pv.product_id = p_product_id
    ) then
      raise exception 'Seleccioná una variante válida y una cantidad entera';
    end if;
  elsif p_product_variant_id is not null then
    raise exception 'El producto no tiene variantes';
  end if;

  if p_lot_id is not null then
    select * into v_lot from public.product_lots
      where id = p_lot_id and organization_id = p_org_id
        and warehouse_id = p_warehouse_id and product_id = p_product_id
      for update;
    if not found then raise exception 'Lote ajeno al producto o depósito'; end if;
    if v_lot.product_variant_id is distinct from p_product_variant_id
      or v_lot.lot_number <> v_lot_number
      or v_lot.expiration_date is distinct from p_expiration_date then
      raise exception 'El ID de lote no coincide con la variante, número y vencimiento';
    end if;
  else
    -- Same key as receipts/transfers for the same commercial identity.
    perform pg_advisory_xact_lock(hashtextextended(
      p_org_id::text || ':' || p_warehouse_id::text || ':' || p_product_id::text || ':' ||
      coalesce(p_product_variant_id::text, '') || ':' || v_lot_number || ':' ||
      coalesce(p_expiration_date::text, ''), 0
    ));
    select count(*) into v_candidate_count from public.product_lots
      where organization_id = p_org_id and warehouse_id = p_warehouse_id
        and product_id = p_product_id
        and product_variant_id is not distinct from p_product_variant_id
        and lot_number = v_lot_number
        and expiration_date is not distinct from p_expiration_date;
    if v_candidate_count > 1 then
      raise exception 'Lote ambiguo: indicá el ID de lote para ajustar una existencia concreta';
    elsif v_candidate_count = 0 then
      insert into public.product_lots (
        organization_id, warehouse_id, product_id, product_variant_id,
        lot_number, expiration_date, quantity_available, unit_quantity_available
      ) values (
        p_org_id, p_warehouse_id, p_product_id, p_product_variant_id,
        v_lot_number, p_expiration_date, 0, 0
      ) returning * into v_lot;
      v_created := true;
    else
      select * into v_lot from public.product_lots
        where organization_id = p_org_id and warehouse_id = p_warehouse_id
          and product_id = p_product_id
          and product_variant_id is not distinct from p_product_variant_id
          and lot_number = v_lot_number
          and expiration_date is not distinct from p_expiration_date for update;
      if not found then raise exception 'El lote cambió durante la importación; reintentá la fila'; end if;
    end if;
  end if;

  v_tracks_units := coalesce(v_product.unit_of_measure in ('KG', 'LT'), false)
    and coalesce(v_product.tracks_stock_units, false);
  if not v_tracks_units and coalesce(p_unit_quantity, 0) <> 0 then
    raise exception 'El producto no registra piezas por separado';
  end if;
  if v_created and v_tracks_units and p_quantity > 0
    and (p_unit_quantity is null or p_unit_quantity <= 0) then
    raise exception 'Ingresá las piezas para el saldo inicial';
  end if;
  v_target_units := coalesce(p_unit_quantity, v_lot.unit_quantity_available, 0);
  v_quantity_delta := p_quantity - v_lot.quantity_available;
  v_unit_delta := case when v_tracks_units
    then v_target_units - coalesce(v_lot.unit_quantity_available, 0) else 0 end;
  if v_quantity_delta <> 0 or v_unit_delta <> 0 then
    v_movement_type := case when v_created and v_quantity_delta > 0
      then 'INBOUND'::public.stock_movement_type else 'ADJUSTMENT'::public.stock_movement_type end;
    perform public.apply_warehouse_stock_movement(
      p_org_id, p_warehouse_id, p_product_id, v_lot.id, v_movement_type,
      v_quantity_delta, case when v_tracks_units then v_unit_delta else null end,
      p_reason, p_source
    );
  end if;
  return v_lot.id;
end;
$$;

revoke all on function public.assert_inventory_warehouse_access(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_warehouse_stock_movement(
  uuid, uuid, uuid, uuid, public.stock_movement_type, numeric, numeric, text, text
) from public, anon, authenticated;
revoke all on function public.set_warehouse_stock_balance(
  uuid, uuid, uuid, numeric, numeric, uuid, text, date, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.apply_warehouse_stock_movement(
  uuid, uuid, uuid, uuid, public.stock_movement_type, numeric, numeric, text, text
) to authenticated;
grant execute on function public.set_warehouse_stock_balance(
  uuid, uuid, uuid, numeric, numeric, uuid, text, date, uuid, text, text
) to authenticated;

commit;
