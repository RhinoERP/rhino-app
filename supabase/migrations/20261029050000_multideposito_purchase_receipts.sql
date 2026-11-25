-- Physical receipts retain the existing transaction: stock, quote allocation,
-- fiscal close and linked-order transitions all commit or roll back together.
-- The new RPC takes a warehouse. The old signature delegates to it during the
-- application cutover, resolving linked purchases from their order and standalone
-- purchases from the principal warehouse. It never borrows stock across locations.
begin;

update public.purchase_receipts r set warehouse_id = w.id
from public.warehouses w
where r.organization_id = w.organization_id and w.is_default
  and r.warehouse_id is null;

-- A catalog variant can have several commercial lots, but only one empty-date
-- DEFAULT balance per warehouse. Simple products may retain repeated lot numbers.
create unique index product_lots_variant_default_warehouse_unique
  on public.product_lots (organization_id, warehouse_id, product_variant_id)
  where product_variant_id is not null
    and lot_number = 'DEFAULT' and expiration_date is null;

create function public.apply_warehouse_purchase_receipt(
  p_org_id uuid, p_purchase_order_id uuid, p_receipt_id uuid,
  p_warehouse_id uuid, p_items jsonb, p_close boolean,
  p_fiscal jsonb default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_po public.purchase_orders%rowtype;
  v_receipt public.purchase_receipts%rowtype;
  v_product public.products%rowtype;
  v_lot public.product_lots%rowtype;
  v_variant record;
  v_line record;
  v_entry record;
  v_fiscal_line record;
  v_order record;
  v_variant_id uuid;
  v_actor uuid;
  v_warehouse_id uuid;
  v_order_warehouse_id uuid;
  v_fingerprint text;
  v_previous numeric;
  v_quantity numeric;
  v_units numeric;
  v_movement_units numeric;
  v_index integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'La recepción requiere un servicio autorizado';
  end if;
  if p_org_id is null or p_purchase_order_id is null
    or p_receipt_id is null or p_close is null
    or coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Entrega inválida';
  end if;

  select * into v_po from public.purchase_orders
    where id = p_purchase_order_id and organization_id = p_org_id for update;
  if not found then raise exception 'Compra no encontrada'; end if;

  -- Preserve receipt identity, including warehouse, even after an order changes
  -- status or the warehouse becomes inactive. A committed retry writes nothing.
  select * into v_receipt from public.purchase_receipts
    where id = p_receipt_id for update;
  if found then
    if v_receipt.organization_id <> p_org_id
      or v_receipt.purchase_order_id <> p_purchase_order_id
      or v_receipt.close_purchase <> p_close then
      raise exception 'La identidad de recepción pertenece a otra operación';
    end if;
    v_warehouse_id := coalesce(p_warehouse_id, v_receipt.warehouse_id);
    if v_warehouse_id is null
      or v_warehouse_id is distinct from v_receipt.warehouse_id then
      raise exception 'No se puede cambiar el depósito de una recepción registrada';
    end if;
    v_fingerprint := 'warehouse-v1:' || md5(
      p_items::text || p_close::text || v_warehouse_id::text
    );
    if v_receipt.request_fingerprint is not null
      and v_receipt.request_fingerprint <> v_fingerprint
      -- Receipts committed by the old RPC have an items/close-only fingerprint.
      and v_receipt.request_fingerprint <> md5(p_items::text || p_close::text) then
      raise exception 'La identidad de recepción ya fue utilizada con otra entrega';
    end if;
    if v_receipt.order_released_at is null
      or (p_close and v_receipt.finalized_at is null) then
      raise exception 'Recepción histórica incompleta: finalizar antes de reintentar';
    end if;
    return false;
  end if;

  if v_po.status not in ('IN_TRANSIT', 'PARTIALLY_RECEIVED') then
    raise exception 'La compra no está disponible para recibir';
  end if;
  if p_close and (p_fiscal is null or jsonb_typeof(p_fiscal) <> 'object') then
    raise exception 'Falta el plan fiscal de cierre';
  end if;

  -- Lock the current association. Partial-receipt release can move the purchase
  -- link from the parent to a child, whose warehouse must remain identical.
  for v_order in select id, warehouse_id from public.orders
      where organization_id = p_org_id and purchase_order_id = p_purchase_order_id
      order by id for update loop
    if v_order_warehouse_id is not null
      and v_order_warehouse_id <> v_order.warehouse_id then
      raise exception 'La compra tiene pedidos vinculados de distintos depósitos';
    end if;
    v_order_warehouse_id := v_order.warehouse_id;
  end loop;
  if v_order_warehouse_id is not null then
    if p_warehouse_id is not null and p_warehouse_id <> v_order_warehouse_id then
      raise exception 'La recepción debe ingresar en el depósito del pedido';
    end if;
    v_warehouse_id := v_order_warehouse_id;
  else
    v_warehouse_id := p_warehouse_id;
    if v_warehouse_id is null then
      select id into v_warehouse_id from public.warehouses
      where organization_id = p_org_id and is_default;
    end if;
  end if;

  if not exists (select 1 from public.warehouses w
      where w.id = v_warehouse_id and w.organization_id = p_org_id and w.is_active
        and (v_order_warehouse_id is null or w.wholesale_enabled)) then
    raise exception 'El depósito de recepción no está activo o no es compatible';
  end if;
  if (select count(distinct value->>'actor_id')
      from jsonb_array_elements(p_items)) <> 1
    or exists (select 1 from jsonb_array_elements(p_items)
      where nullif(value->>'actor_id', '') is null) then
    raise exception 'La recepción requiere un único responsable';
  end if;
  v_actor := (p_items->0->>'actor_id')::uuid;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = v_actor and m.is_active
      and (m.is_owner or exists (
        select 1 from public.role_permissions rp
        join public.permissions permission on permission.id = rp.permission_id
        where rp.role_id = m.role_id
          and permission.key in ('purchases.manage', 'organization.admin')
      ))
      and (m.is_owner or exists (
        select 1 from public.role_permissions rp
        join public.permissions permission on permission.id = rp.permission_id
        where rp.role_id = m.role_id and permission.key = 'organization.admin'
      ) or exists (
        select 1 from public.warehouse_user_assignments a
        where a.organization_id = p_org_id and a.user_id = v_actor
          and a.warehouse_id = v_warehouse_id
      ))
  ) then
    raise exception 'El responsable no tiene permiso para recibir en este depósito';
  end if;

  -- Keep ordered baselines, line validation, partial totals and purchase-state
  -- updates in the existing receipt registrar. Its header is completed below
  -- before any stock movement or quote allocation becomes visible.
  perform public.record_purchase_receipt(
    p_org_id, p_purchase_order_id, p_receipt_id, p_items, p_close
  );
  v_fingerprint := 'warehouse-v1:' || md5(
    p_items::text || p_close::text || v_warehouse_id::text
  );
  update public.purchase_receipts
    set request_fingerprint = v_fingerprint, warehouse_id = v_warehouse_id
    where id = p_receipt_id and organization_id = p_org_id;

  for v_line in select * from jsonb_to_recordset(p_items) as x(
    item_id uuid, product_id uuid, quantity numeric, unit_quantity numeric,
    variant_stocks jsonb, lots jsonb
  ) order by item_id loop
    select * into v_product from public.products
      where id = v_line.product_id and organization_id = p_org_id;
    if not found then raise exception 'Producto ajeno a la organización'; end if;
    if v_product.has_variants then
      if coalesce(jsonb_typeof(v_line.variant_stocks), 'null') <> 'object' then
        raise exception 'La matriz recibida no es válida';
      end if;
      for v_variant in select c.key as color, s.key as talle,
          (s.value #>> '{}')::numeric as quantity
        from jsonb_each(v_line.variant_stocks) c
        cross join lateral jsonb_each(c.value) s
        order by c.key, s.key loop
        select pv.id into v_variant_id from public.product_variants pv
          where pv.organization_id = p_org_id and pv.product_id = v_product.id
            and pv.color = v_variant.color and pv.talle = v_variant.talle;
        if not found then raise exception 'Variante ajena al producto'; end if;
        v_quantity := v_variant.quantity;
        if v_quantity is null or v_quantity <= 0 or trunc(v_quantity) <> v_quantity then
          raise exception 'Cantidad de variante inválida';
        end if;

        -- Match the lock key used by transfers so concurrent receipts/transfers
        -- cannot create two balances for this commercial DEFAULT lot.
        perform pg_advisory_xact_lock(hashtextextended(
          p_org_id::text || ':' || v_warehouse_id::text || ':' ||
          v_product.id::text || ':' || v_variant_id::text || ':DEFAULT:', 0
        ));
        insert into public.product_lots (
          organization_id, warehouse_id, product_id, product_variant_id,
          lot_number, expiration_date, quantity_available, unit_quantity_available
        ) values (
          p_org_id, v_warehouse_id, v_product.id, v_variant_id,
          'DEFAULT', null, 0, 0
        ) on conflict do nothing;
        select * into v_lot from public.product_lots
          where organization_id = p_org_id and warehouse_id = v_warehouse_id
            and product_id = v_product.id and product_variant_id = v_variant_id
            and lot_number = 'DEFAULT' and expiration_date is null for update;
        if not found then raise exception 'No se pudo resolver el saldo de la variante'; end if;
        v_previous := v_lot.quantity_available;
        update public.product_lots set quantity_available = v_previous + v_quantity,
          updated_at = now() where id = v_lot.id and organization_id = p_org_id;
        v_index := v_index + 1;
        insert into public.stock_movements (
          organization_id, warehouse_id, lot_id, type, quantity, previous_stock,
          new_stock, reason, created_by, source, purchase_receipt_id,
          purchase_receipt_movement_index
        ) values (
          p_org_id, v_warehouse_id, v_lot.id, 'INBOUND', v_quantity, v_previous,
          v_previous + v_quantity, 'Recepción de compra ' || p_receipt_id,
          v_actor, 'PURCHASE', p_receipt_id, v_index
        );
      end loop;
    else
      if coalesce(jsonb_typeof(v_line.lots), 'null') <> 'array' then
        raise exception 'Los lotes recibidos no son válidos';
      end if;
      if (select coalesce(sum((entry.value->>'quantity')::numeric), 0)
          from jsonb_array_elements(v_line.lots) entry) <> v_line.quantity
        or (select coalesce(sum((entry.value->>'unitQuantity')::numeric), 0)
          from jsonb_array_elements(v_line.lots) entry) <> v_line.unit_quantity then
        raise exception 'La suma de lotes no coincide con la entrega';
      end if;
      for v_entry in select value as lot from jsonb_array_elements(v_line.lots) loop
        if nullif(trim(v_entry.lot->>'lotNumber'), '') is null
          or nullif(v_entry.lot->>'expirationDate', '') is null then
          raise exception 'Número y vencimiento de lote requeridos';
        end if;
        v_quantity := case when v_product.unit_of_measure in ('KG', 'LT', 'MT')
          then (v_entry.lot->>'unitQuantity')::numeric
          else (v_entry.lot->>'quantity')::numeric end;
        v_units := (v_entry.lot->>'quantity')::numeric;
        if v_quantity is null or v_quantity <= 0 or v_units is null or v_units < 0
          or (v_entry.lot->>'unitQuantity')::numeric is null
          or (v_entry.lot->>'unitQuantity')::numeric < 0 then
          raise exception 'Cantidad de lote inválida';
        end if;
        v_movement_units := case when v_product.unit_of_measure in ('KG', 'LT')
          and v_product.tracks_stock_units and v_units > 0 then v_units else null end;
        if v_product.unit_of_measure in ('KG', 'LT') and v_product.tracks_stock_units
          and v_movement_units is null then
          raise exception 'Ingresá las unidades para registrar el ingreso';
        end if;
        insert into public.product_lots (
          organization_id, warehouse_id, product_id, lot_number, expiration_date,
          quantity_available, unit_quantity_available
        ) values (
          p_org_id, v_warehouse_id, v_product.id,
          trim(v_entry.lot->>'lotNumber'), (v_entry.lot->>'expirationDate')::date, 0, 0
        ) returning * into v_lot;
        update public.product_lots set quantity_available = v_quantity,
          unit_quantity_available = coalesce(v_movement_units, 0),
          updated_at = now() where id = v_lot.id and organization_id = p_org_id;
        v_index := v_index + 1;
        insert into public.stock_movements (
          organization_id, warehouse_id, lot_id, type, quantity, previous_stock,
          new_stock, unit_quantity, reason, created_by, source, purchase_receipt_id,
          purchase_receipt_movement_index
        ) values (
          p_org_id, v_warehouse_id, v_lot.id, 'INBOUND', v_quantity, 0, v_quantity,
          v_movement_units, 'Recepción de compra ' || p_receipt_id,
          v_actor, 'PURCHASE', p_receipt_id, v_index
        );
      end loop;
    end if;
  end loop;

  perform public.release_purchase_receipt_to_order(p_org_id, p_receipt_id);
  if p_close then
    if coalesce(jsonb_typeof(p_fiscal->'items'), 'null') <> 'array'
      or coalesce(jsonb_typeof(p_fiscal->'item_taxes'), 'null') <> 'array'
      or coalesce(jsonb_typeof(p_fiscal->'order_taxes'), 'null') <> 'array'
      or coalesce(jsonb_typeof(p_fiscal->'fallback_taxes'), 'null') <> 'array'
      or (p_fiscal->>'mode') not in ('receipt', 'receipt_legacy') then
      raise exception 'El plan fiscal de cierre no es válido';
    end if;
    if (select count(*) from jsonb_array_elements(p_fiscal->'items')) <>
      (select count(distinct purchase_order_item_id) from public.purchase_receipt_items
        where organization_id = p_org_id and purchase_order_id = p_purchase_order_id) then
      raise exception 'El plan fiscal omite líneas recibidas';
    end if;
    for v_fiscal_line in select * from jsonb_to_recordset(p_fiscal->'items') as x(
      id uuid, product_id uuid, quantity numeric, unit_quantity numeric,
      subtotal numeric, variant_stocks jsonb
    ) loop
      if not exists (select 1 from public.purchase_order_items poi
          where poi.id = v_fiscal_line.id and poi.product_id = v_fiscal_line.product_id
            and poi.organization_id = p_org_id and poi.purchase_order_id = p_purchase_order_id)
        or (select coalesce(sum(pri.quantity), 0) from public.purchase_receipt_items pri
          where pri.organization_id = p_org_id and pri.purchase_order_id = p_purchase_order_id
            and pri.purchase_order_item_id = v_fiscal_line.id) <> v_fiscal_line.quantity
        or (select coalesce(sum(pri.unit_quantity), 0) from public.purchase_receipt_items pri
          where pri.organization_id = p_org_id and pri.purchase_order_id = p_purchase_order_id
            and pri.purchase_order_item_id = v_fiscal_line.id) <> v_fiscal_line.unit_quantity
        or (select coalesce(sum(trunc((case when pri.unit_quantity > 0
              then pri.unit_quantity else pri.quantity end) * pri.unit_cost, 2)), 0)
            from public.purchase_receipt_items pri
            where pri.organization_id = p_org_id and pri.purchase_order_id = p_purchase_order_id
              and pri.purchase_order_item_id = v_fiscal_line.id) <> v_fiscal_line.subtotal then
        raise exception 'El cierre fiscal no coincide con las entregas registradas';
      end if;
      if exists (select 1 from public.purchase_receipt_items pri
          cross join lateral jsonb_each(pri.variant_stocks) c
          cross join lateral jsonb_each(c.value) s
          where pri.organization_id = p_org_id and pri.purchase_order_id = p_purchase_order_id
            and pri.purchase_order_item_id = v_fiscal_line.id
          group by c.key, s.key
          having sum((s.value #>> '{}')::numeric) <>
            coalesce((v_fiscal_line.variant_stocks->c.key->>s.key)::numeric, 0))
        or exists (select 1 from jsonb_each(coalesce(v_fiscal_line.variant_stocks, '{}'::jsonb)) c
          cross join lateral jsonb_each(c.value) s
          where coalesce((select sum((pri.variant_stocks->c.key->>s.key)::numeric)
            from public.purchase_receipt_items pri
            where pri.organization_id = p_org_id and pri.purchase_order_id = p_purchase_order_id
              and pri.purchase_order_item_id = v_fiscal_line.id), 0) <>
              (s.value #>> '{}')::numeric) then
        raise exception 'El cierre fiscal no coincide con los talles recibidos';
      end if;
    end loop;
    if (p_fiscal->>'supplier_id')::uuid is distinct from v_po.supplier_id
      or (p_fiscal->>'purchase_date')::date is distinct from v_po.purchase_date
      or (p_fiscal->>'expiration_date')::date is distinct from v_po.expiration_date
      or (p_fiscal->>'remittance_number') is distinct from v_po.remittance_number then
      raise exception 'La compra cambió desde la preparación del cierre';
    end if;
    perform public.persist_purchase_fiscal_state(
      p_org_id, p_purchase_order_id, p_fiscal->>'mode',
      p_fiscal->'items', p_fiscal->'item_taxes', p_fiscal->'order_taxes',
      (p_fiscal->>'subtotal')::numeric, (p_fiscal->>'tax_amount')::numeric,
      (p_fiscal->>'discount_percentage')::numeric,
      (p_fiscal->>'discount_amount')::numeric,
      (p_fiscal->>'total_amount')::numeric, p_fiscal->'fallback_taxes',
      v_po.supplier_id, v_po.purchase_date, v_po.expiration_date,
      v_po.remittance_number, null, v_po.expiration_date
    );
    update public.purchase_orders set status = 'RECEIVED', updated_at = now()
      where id = p_purchase_order_id and organization_id = p_org_id;
    perform public.finalize_purchase_receipt_order(p_org_id, p_receipt_id);
    perform public.complete_purchase_receipt(p_org_id, p_receipt_id);
  end if;
  return true;
end;
$$;

revoke all on function public.apply_warehouse_purchase_receipt(uuid, uuid, uuid, uuid, jsonb, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_warehouse_purchase_receipt(uuid, uuid, uuid, uuid, jsonb, boolean, jsonb)
  to service_role;

-- Old deployments continue through the new implementation without a signature
-- overload that would make PostgREST RPC resolution ambiguous.
create or replace function public.apply_atomic_purchase_receipt(
  p_org_id uuid, p_purchase_order_id uuid, p_receipt_id uuid,
  p_items jsonb, p_close boolean, p_fiscal jsonb default null
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  return public.apply_warehouse_purchase_receipt(
    p_org_id, p_purchase_order_id, p_receipt_id, null, p_items, p_close, p_fiscal
  );
end;
$$;
revoke all on function public.apply_atomic_purchase_receipt(uuid, uuid, uuid, jsonb, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_atomic_purchase_receipt(uuid, uuid, uuid, jsonb, boolean, jsonb)
  to service_role;

commit;
