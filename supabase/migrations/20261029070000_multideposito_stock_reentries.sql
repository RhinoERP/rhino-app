-- Reentry location and origin are separate: an explicit fallback may reenter
-- the principal warehouse while retaining the original physical lot identity.
-- Historical movements are deliberately not guessed/backfilled.
begin;

alter table public.stock_movements
  add column reentry_source_lot_id uuid references public.product_lots(id),
  add column reentry_key text,
  add column reentry_fingerprint text,
  add column reentry_reversed_at timestamptz,
  add column reentry_reversal_movement_id uuid references public.stock_movements(id),
  add constraint stock_movements_reentry_identity_check check (
    (reentry_source_lot_id is null and reentry_key is null
      and reentry_fingerprint is null and reentry_reversed_at is null
      and reentry_reversal_movement_id is null)
    or (reentry_source_lot_id is not null and reentry_key is not null
      and reentry_fingerprint is not null
      and ((reentry_reversed_at is null) = (reentry_reversal_movement_id is null)))
  );
create unique index stock_movements_reentry_once
  on public.stock_movements (organization_id, reentry_key)
  where reentry_key is not null;
create index stock_movements_reentry_origin
  on public.stock_movements (organization_id, reentry_source_lot_id)
  where reentry_source_lot_id is not null;

-- Private helper. Document-specific permissions/ownership are checked by the
-- calling return/cancellation/order service; this helper rechecks membership,
-- destination activity and warehouse assignment at stock-write time.
create function public.assert_stock_reentry_destination(
  p_org_id uuid, p_actor_id uuid, p_warehouse_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_member public.organization_members%rowtype;
  v_admin boolean;
begin
  select * into v_member from public.organization_members
    where organization_id = p_org_id and user_id = p_actor_id and is_active
    for share;
  if not found then raise exception 'El responsable no pertenece a la organización'; end if;
  v_admin := v_member.is_owner or exists (
    select 1 from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions permission on permission.id = rp.permission_id
    where r.id = v_member.role_id and r.organization_id = p_org_id
      and permission.key = 'organization.admin'
  );
  perform 1 from public.warehouses
    where id = p_warehouse_id and organization_id = p_org_id and is_active
    for share;
  if not found then raise exception 'El depósito de reingreso no está activo'; end if;
  if not v_admin then
    perform 1 from public.warehouse_user_assignments
      where organization_id = p_org_id and user_id = p_actor_id
        and warehouse_id = p_warehouse_id for share;
    if not found then raise exception 'Sin acceso al depósito de reingreso'; end if;
  end if;
end;
$$;

create function public.apply_stock_reentries(
  p_org_id uuid, p_actor_id uuid, p_entries jsonb,
  p_allow_default_fallback boolean default false
) returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  v_entry record;
  v_source public.product_lots%rowtype;
  v_destination public.product_lots%rowtype;
  v_product public.products%rowtype;
  v_existing public.stock_movements%rowtype;
  v_source_id uuid;
  v_destination_warehouse uuid;
  v_original_active boolean;
  v_key text;
  v_reason text;
  v_fingerprint text;
  v_quantity numeric;
  v_units numeric;
  v_tracks_units boolean;
  v_previous numeric;
  v_previous_units numeric;
  v_candidate_count bigint;
  v_movement_id uuid;
  v_result uuid[] := array[]::uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'El reingreso requiere un servicio autorizado';
  end if;
  if p_org_id is null or p_actor_id is null or p_allow_default_fallback is null
    or coalesce(jsonb_typeof(p_entries), 'null') <> 'array'
    or jsonb_array_length(p_entries) = 0 then
    raise exception 'Reingreso inválido';
  end if;
  perform 1 from public.organization_members
    where organization_id = p_org_id and user_id = p_actor_id and is_active
    for share;
  if not found then raise exception 'Responsable de reingreso no autorizado'; end if;
  if exists (select 1 from jsonb_array_elements(p_entries) e
      group by btrim(e->>'operation_key') having count(*) > 1) then
    raise exception 'Las claves de reingreso no pueden repetirse en la operación';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
      order by value->>'source_lot_id', value->>'operation_key' loop
    v_source_id := (v_entry.value->>'source_lot_id')::uuid;
    v_key := nullif(btrim(v_entry.value->>'operation_key'), '');
    v_reason := nullif(btrim(v_entry.value->>'reason'), '');
    v_quantity := (v_entry.value->>'quantity')::numeric;
    v_units := (v_entry.value->>'unit_quantity')::numeric;
    if v_source_id is null or v_key is null or length(v_key) > 200 or v_reason is null
      or v_quantity is null or v_quantity < 0
      or v_quantity::text in ('NaN', 'Infinity', '-Infinity')
      or (v_units is not null and (v_units < 0
        or v_units::text in ('NaN', 'Infinity', '-Infinity')))
      or (v_quantity = 0 and coalesce(v_units, 0) = 0) then
      raise exception 'Cantidad, origen o identidad de reingreso inválidos';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      p_org_id::text || ':reentry:' || v_key, 0
    ));
    v_fingerprint := md5(jsonb_build_object(
      'source_lot_id', v_source_id, 'quantity', v_quantity,
      'unit_quantity', v_units, 'reason', v_reason, 'actor_id', p_actor_id,
      'allow_default_fallback', p_allow_default_fallback
    )::text);
    select * into v_existing from public.stock_movements
      where organization_id = p_org_id and reentry_key = v_key for update;
    if found then
      if v_existing.reentry_fingerprint is distinct from v_fingerprint
        or v_existing.reentry_reversed_at is not null then
        raise exception 'La identidad de reingreso ya fue utilizada o revertida';
      end if;
      v_result := array_append(v_result, v_existing.id);
      continue;
    end if;

    -- Missing original lots are a separate legacy case. Never manufacture a
    -- replacement origin or silently choose a principal lot in that situation.
    select * into v_source from public.product_lots
      where id = v_source_id and organization_id = p_org_id for update;
    if not found then raise exception 'No se encontró el lote original del reingreso'; end if;
    select * into v_product from public.products
      where id = v_source.product_id and organization_id = p_org_id;
    if not found then raise exception 'Producto de reingreso ajeno a la organización'; end if;
    if v_product.has_variants and (trunc(v_quantity) <> v_quantity or not exists (
      select 1 from public.product_variants pv
      where pv.id = v_source.product_variant_id and pv.organization_id = p_org_id
        and pv.product_id = v_source.product_id
    )) then
      raise exception 'El reingreso requiere una variante válida y cantidad entera';
    end if;
    v_tracks_units := coalesce(v_product.unit_of_measure in ('KG', 'LT'), false)
      and coalesce(v_product.tracks_stock_units, false);
    if not v_tracks_units and coalesce(v_units, 0) <> 0 then
      raise exception 'El producto no registra piezas por separado';
    end if;

    select is_active into v_original_active from public.warehouses
      where id = v_source.warehouse_id and organization_id = p_org_id for share;
    if not found then raise exception 'Depósito original no encontrado'; end if;
    if v_original_active then
      v_destination_warehouse := v_source.warehouse_id;
      v_destination := v_source;
    else
      if not p_allow_default_fallback then
        raise exception using
          message = 'El depósito original está desactivado. Confirmá si querés enviar el stock al depósito principal.',
          detail = 'WAREHOUSE_FALLBACK_CONFIRMATION_REQUIRED';
      end if;
      select id into v_destination_warehouse from public.warehouses
        where organization_id = p_org_id and is_default and is_active for share;
      if not found then raise exception 'No hay un depósito principal activo para el reingreso'; end if;
    end if;
    perform public.assert_stock_reentry_destination(
      p_org_id, p_actor_id, v_destination_warehouse
    );

    if not v_original_active then
      -- Same commercial-lot lock key used by receipts, adjustments and transfers.
      perform pg_advisory_xact_lock(hashtextextended(
        p_org_id::text || ':' || v_destination_warehouse::text || ':' ||
        v_source.product_id::text || ':' || coalesce(v_source.product_variant_id::text, '') || ':' ||
        v_source.lot_number || ':' || coalesce(v_source.expiration_date::text, ''), 0
      ));
      select count(*) into v_candidate_count from public.product_lots
        where organization_id = p_org_id and warehouse_id = v_destination_warehouse
          and product_id = v_source.product_id
          and product_variant_id is not distinct from v_source.product_variant_id
          and lot_number = v_source.lot_number
          and expiration_date is not distinct from v_source.expiration_date;
      if v_candidate_count > 1 then
        raise exception 'Hay varios lotes equivalentes en el principal; el destino requiere desambiguación';
      elsif v_candidate_count = 0 then
        insert into public.product_lots (
          organization_id, warehouse_id, product_id, product_variant_id,
          lot_number, expiration_date, quantity_available, unit_quantity_available
        ) values (
          p_org_id, v_destination_warehouse, v_source.product_id, v_source.product_variant_id,
          v_source.lot_number, v_source.expiration_date, 0, 0
        ) returning * into v_destination;
      else
        select * into v_destination from public.product_lots
          where organization_id = p_org_id and warehouse_id = v_destination_warehouse
            and product_id = v_source.product_id
            and product_variant_id is not distinct from v_source.product_variant_id
            and lot_number = v_source.lot_number
            and expiration_date is not distinct from v_source.expiration_date for update;
        if not found then raise exception 'El lote de destino cambió; reintentá el reingreso'; end if;
      end if;
    end if;

    v_previous := v_destination.quantity_available;
    v_previous_units := coalesce(v_destination.unit_quantity_available, 0);
    update public.product_lots set quantity_available = v_previous + v_quantity,
      unit_quantity_available = case when v_tracks_units
        then v_previous_units + coalesce(v_units, 0) else v_destination.unit_quantity_available end,
      updated_at = now()
      where id = v_destination.id and organization_id = p_org_id;
    insert into public.stock_movements (
      organization_id, warehouse_id, lot_id, type, quantity, previous_stock,
      new_stock, unit_quantity, reason, created_by, source,
      reentry_source_lot_id, reentry_key, reentry_fingerprint
    ) values (
      p_org_id, v_destination_warehouse, v_destination.id, 'INBOUND', v_quantity,
      v_previous, v_previous + v_quantity,
      case when v_tracks_units then v_units else null end,
      v_reason, p_actor_id, 'RETURN', v_source.id, v_key, v_fingerprint
    ) returning id into v_movement_id;
    v_result := array_append(v_result, v_movement_id);
  end loop;
  return v_result;
end;
$$;

-- Compensation for a failed document workflow. Subtract only the quantities
-- this reentry added; never overwrite a balance snapshot after concurrent sales.
-- Retain both audit legs and make repeated compensation requests harmless.
create function public.undo_stock_reentries(
  p_org_id uuid, p_actor_id uuid, p_movement_ids uuid[]
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_movement public.stock_movements%rowtype;
  v_lot public.product_lots%rowtype;
  v_reversal_id uuid;
  v_units numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'La compensación requiere un servicio autorizado';
  end if;
  if p_org_id is null or p_actor_id is null or p_movement_ids is null then
    raise exception 'Compensación inválida';
  end if;
  perform 1 from public.organization_members
    where organization_id = p_org_id and user_id = p_actor_id and is_active for share;
  if not found then raise exception 'Responsable de compensación no autorizado'; end if;
  for v_id in select distinct entry from unnest(p_movement_ids) entry order by entry loop
    select * into v_movement from public.stock_movements
      where id = v_id and organization_id = p_org_id for update;
    if not found or v_movement.reentry_source_lot_id is null
      or v_movement.type::text <> 'INBOUND'
      or v_movement.created_by is distinct from p_actor_id then
      raise exception 'El movimiento no es un reingreso compensable del responsable';
    end if;
    if v_movement.reentry_reversed_at is not null then continue; end if;
    select * into v_lot from public.product_lots
      where id = v_movement.lot_id and organization_id = p_org_id for update;
    if not found then raise exception 'Lote de compensación no encontrado'; end if;
    v_units := coalesce(v_movement.unit_quantity, 0);
    if v_lot.quantity_available < v_movement.quantity
      or (v_units > 0 and coalesce(v_lot.unit_quantity_available, 0) < v_units) then
      raise exception 'El stock reingresado ya fue consumido; no se puede compensar automáticamente';
    end if;
    update public.product_lots set
      quantity_available = v_lot.quantity_available - v_movement.quantity,
      unit_quantity_available = case when v_movement.unit_quantity is not null
        then coalesce(v_lot.unit_quantity_available, 0) - v_units
        else v_lot.unit_quantity_available end,
      updated_at = now()
      where id = v_lot.id and organization_id = p_org_id;
    insert into public.stock_movements (
      organization_id, warehouse_id, lot_id, type, quantity, previous_stock,
      new_stock, unit_quantity, reason, created_by, source
    ) values (
      p_org_id, v_lot.warehouse_id, v_lot.id, 'OUTBOUND', v_movement.quantity,
      v_lot.quantity_available, v_lot.quantity_available - v_movement.quantity,
      case when v_movement.unit_quantity is not null then -v_units else null end,
      'Reversión de reingreso ' || v_movement.id, p_actor_id, 'RETURN'
    ) returning id into v_reversal_id;
    update public.stock_movements set reentry_reversed_at = now(),
      reentry_reversal_movement_id = v_reversal_id
      where id = v_movement.id and organization_id = p_org_id;
  end loop;
end;
$$;

revoke all on function public.assert_stock_reentry_destination(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_stock_reentries(uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.undo_stock_reentries(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.apply_stock_reentries(uuid, uuid, jsonb, boolean)
  to service_role;
grant execute on function public.undo_stock_reentries(uuid, uuid, uuid[])
  to service_role;

commit;
