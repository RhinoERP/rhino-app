-- Deliveries are independent from ordered quantities. Freeze the original OC
-- lines and settle the provisional payable from actual receipts on closing.

create table public.purchase_receipts (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  purchase_order_id uuid not null references public.purchase_orders(id),
  received_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  close_purchase boolean not null default false,
  order_released_at timestamptz,
  finalized_at timestamptz,
  ready_order_id uuid references public.orders(id),
  unique (id, organization_id, purchase_order_id)
);

create index purchase_receipts_order_idx
  on public.purchase_receipts (organization_id, purchase_order_id, received_at);

-- The ordered baseline is immutable; the OC lines become the actual purchase
-- on closing, while customer quote quantities remain independently conserved.
create table public.purchase_receipt_ordered_items (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  purchase_order_id uuid not null references public.purchase_orders(id),
  product_id uuid not null references public.products(id),
  quantity numeric not null,
  unit_quantity numeric,
  variant_stocks jsonb not null default '{}'::jsonb
);
create index purchase_receipt_ordered_items_order_idx
  on public.purchase_receipt_ordered_items (organization_id, purchase_order_id);

create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  purchase_order_id uuid not null,
  receipt_id uuid not null,
  -- Keep the original line identity even if the fiscal close removes a short line.
  purchase_order_item_id uuid not null,
  product_id uuid not null references public.products(id),
  is_extra boolean not null default false,
  quantity numeric not null check (quantity >= 0),
  unit_quantity numeric not null default 0 check (unit_quantity >= 0),
  constraint purchase_receipt_items_nonempty_check
    check (quantity > 0 or unit_quantity > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  variant_stocks jsonb not null default '{}'::jsonb,
  lots jsonb not null default '[]'::jsonb,
  unique (receipt_id, purchase_order_item_id),
  foreign key (receipt_id, organization_id, purchase_order_id)
    references public.purchase_receipts(id, organization_id, purchase_order_id)
);

create index purchase_receipt_items_item_idx
  on public.purchase_receipt_items (organization_id, purchase_order_item_id);

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;
alter table public.purchase_receipt_ordered_items enable row level security;
grant select on public.purchase_receipt_ordered_items to service_role;
grant select on public.purchase_receipts, public.purchase_receipt_items to authenticated;

create policy purchase_receipts_read on public.purchase_receipts
  for select to authenticated using (
    public.purchase_item_tax_access(organization_id, false)
    and exists (select 1 from public.purchase_orders po
      where po.id = purchase_order_id and po.organization_id = organization_id)
  );
create policy purchase_receipt_items_read on public.purchase_receipt_items
  for select to authenticated using (
    public.purchase_item_tax_access(organization_id, false)
    and exists (select 1 from public.purchase_receipts pr
      where pr.id = receipt_id and pr.organization_id = organization_id
        and pr.purchase_order_id = purchase_order_id)
  );

-- Writes are deliberately restricted to the locked, permission-checked RPC.
revoke insert, update, delete on public.purchase_receipts from public, anon, authenticated;
revoke insert, update, delete on public.purchase_receipt_items from public, anon, authenticated;

create or replace function public.record_purchase_receipt(
  p_org_id uuid, p_purchase_order_id uuid, p_receipt_id uuid,
  p_items jsonb, p_close boolean
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_po public.purchase_orders%rowtype;
  v_line record;
  v_ordered public.purchase_order_items%rowtype;
  v_product public.products%rowtype;
  v_variant record;
  v_allocated numeric;
  v_remaining boolean;
  v_actor uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.purchase_item_tax_access(p_org_id, true), false) then
    raise exception 'Sin permisos para recibir la compra';
  end if;
  select * into v_po from public.purchase_orders
    where id = p_purchase_order_id and organization_id = p_org_id for update;
  if not found or v_po.status not in ('IN_TRANSIT', 'PARTIALLY_RECEIVED') then
    raise exception 'La compra no está en un estado válido para recibir';
  end if;
  if p_receipt_id is null or p_close is null
    or coalesce(jsonb_typeof(p_items), 'null') <> 'array' then
    raise exception 'La recepción no contiene ítems válidos';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'La recepción no contiene ítems válidos';
  end if;
  if exists (select 1 from public.purchase_receipts where id = p_receipt_id) then
    raise exception 'Esta recepción ya fue registrada';
  end if;
  if (select count(*) <> count(distinct value->>'item_id')
      from jsonb_array_elements(p_items)) then
    raise exception 'La recepción tiene ítems repetidos';
  end if;
  if (select count(distinct value->>'actor_id') from jsonb_array_elements(p_items)) <> 1 then
    raise exception 'La recepción no identifica a un único responsable';
  end if;
  v_actor := (p_items->0->>'actor_id')::uuid;
  if not exists (select 1 from public.organization_members om
    where om.organization_id = p_org_id and om.user_id = v_actor
      and om.is_active = true) then
    raise exception 'El responsable no pertenece a la organización';
  end if;

  -- Freeze the original OC before the first physical receipt adds any lines.
  insert into public.purchase_receipt_ordered_items (
    id, organization_id, purchase_order_id, product_id,
    quantity, unit_quantity, variant_stocks
  ) select poi.id, p_org_id, p_purchase_order_id, poi.product_id,
      poi.quantity, poi.unit_quantity, coalesce(poi.variant_stocks, '{}'::jsonb)
    from public.purchase_order_items poi
    where poi.organization_id = p_org_id and poi.purchase_order_id = p_purchase_order_id
      and not exists (select 1 from public.purchase_receipts pr
        where pr.purchase_order_id = p_purchase_order_id and pr.organization_id = p_org_id)
  on conflict (id) do nothing;

  for v_line in select * from jsonb_to_recordset(p_items) as x(
    item_id uuid, product_id uuid, quantity numeric, unit_quantity numeric,
    unit_cost numeric, variant_stocks jsonb, lots jsonb, new_item boolean
  ) loop
    select * into v_product from public.products
      where id = v_line.product_id and organization_id = p_org_id;
    if not found or v_line.item_id is null
      or v_line.quantity is null or v_line.quantity < 0
      or v_line.unit_quantity is null or v_line.unit_quantity < 0
      or (v_line.quantity = 0 and v_line.unit_quantity = 0)
      or v_line.unit_cost is null or v_line.unit_cost < 0 then
      raise exception 'El producto recibido no pertenece a esta organización o tiene cantidades inválidas';
    end if;
    if coalesce(jsonb_typeof(v_line.lots), 'null') <> 'array' then
      raise exception 'Los lotes de la entrega tienen un formato inválido';
    end if;
    if coalesce(v_line.new_item, false) then
      if exists (select 1 from public.purchase_order_items poi
        where poi.id = v_line.item_id or (poi.organization_id = p_org_id
          and poi.purchase_order_id = p_purchase_order_id
          and poi.product_id = v_line.product_id)) then
        raise exception 'El producto ya figura en la compra';
      end if;
      insert into public.purchase_order_items (
        id, organization_id, purchase_order_id, product_id,
        quantity, unit_quantity, unit_cost, subtotal, variant_stocks
      ) values (
        v_line.item_id, p_org_id, p_purchase_order_id, v_line.product_id,
        v_line.quantity, v_line.unit_quantity, v_line.unit_cost,
        trunc((case when v_product.unit_of_measure in ('KG','LT','MT')
          then v_line.unit_quantity else v_line.quantity end) * v_line.unit_cost, 2),
        coalesce(v_line.variant_stocks, '{}'::jsonb)
      );
    else
      select * into v_ordered from public.purchase_order_items
        where id = v_line.item_id and organization_id = p_org_id
          and purchase_order_id = p_purchase_order_id for update;
      if not found or v_ordered.product_id <> v_line.product_id then
        raise exception 'El ítem recibido no pertenece a esta compra';
      end if;
    end if;
    if v_product.has_variants then
      if jsonb_typeof(v_line.variant_stocks) <> 'object' then
        raise exception 'Las variantes recibidas tienen un formato inválido';
      end if;
      v_allocated := 0;
      for v_variant in select color.key as color, size.key as talle,
          (size.value #>> '{}')::numeric as qty
        from jsonb_each(v_line.variant_stocks) color
        cross join lateral jsonb_each(color.value) size
      loop
        if v_variant.qty <= 0 or trunc(v_variant.qty) <> v_variant.qty
          or not exists (select 1 from public.product_variants pv
            where pv.product_id = v_line.product_id and pv.organization_id = p_org_id
              and pv.color = v_variant.color and pv.talle = v_variant.talle) then
          raise exception 'Variante recibida inválida';
        end if;
        v_allocated := v_allocated + v_variant.qty;
      end loop;
      if v_allocated <> v_line.quantity then
        raise exception 'La suma de variantes no coincide con lo recibido';
      end if;
    end if;
  end loop;

  insert into public.purchase_receipts (
    id, organization_id, purchase_order_id, created_by, close_purchase
  ) values (p_receipt_id, p_org_id, p_purchase_order_id, v_actor, p_close);
  insert into public.purchase_receipt_items (
    organization_id, purchase_order_id, receipt_id, purchase_order_item_id,
    product_id, is_extra, quantity, unit_quantity, unit_cost, variant_stocks, lots
  ) select p_org_id, p_purchase_order_id, p_receipt_id,
      x.item_id, x.product_id,
      not exists (select 1 from public.purchase_receipt_ordered_items original
        where original.id = x.item_id and original.organization_id = p_org_id
          and original.purchase_order_id = p_purchase_order_id),
      x.quantity, x.unit_quantity, x.unit_cost,
      coalesce(x.variant_stocks, '{}'::jsonb), x.lots
    from jsonb_to_recordset(p_items) as x(
      item_id uuid, product_id uuid, quantity numeric, unit_quantity numeric,
      unit_cost numeric, variant_stocks jsonb, lots jsonb, new_item boolean
    );

  select exists (
    select 1 from public.purchase_receipt_ordered_items poi
    join public.products p on p.id = poi.product_id and p.organization_id = p_org_id
    left join (
      select purchase_order_item_id, sum(quantity) as quantity,
        sum(unit_quantity) as unit_quantity
      from public.purchase_receipt_items where organization_id = p_org_id
        and purchase_order_id = p_purchase_order_id group by purchase_order_item_id
    ) received on received.purchase_order_item_id = poi.id
    where poi.organization_id = p_org_id and poi.purchase_order_id = p_purchase_order_id
      and (exists (select 1 from jsonb_each(poi.variant_stocks) c
        cross join lateral jsonb_each(c.value) s
        where (select coalesce(sum((pri.variant_stocks -> c.key ->> s.key)::numeric), 0)
          from public.purchase_receipt_items pri
          where pri.organization_id = p_org_id and pri.purchase_order_item_id = poi.id)
          < (s.value #>> '{}')::numeric)
        or (coalesce(poi.variant_stocks, '{}'::jsonb) = '{}'::jsonb
          and coalesce(received.quantity, 0) < poi.quantity)
        or (p.unit_of_measure in ('KG', 'LT', 'MT')
          and coalesce(poi.unit_quantity, 0) > 0
          and coalesce(received.unit_quantity, 0) < poi.unit_quantity))
  ) into v_remaining;
  if not p_close then
    update public.purchase_orders set status = 'PARTIALLY_RECEIVED', updated_at = now()
      where id = p_purchase_order_id and organization_id = p_org_id;
  end if;
  return v_remaining;
end;
$$;

revoke all on function public.record_purchase_receipt(uuid, uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.record_purchase_receipt(uuid, uuid, uuid, jsonb, boolean)
  to service_role;

-- The existing close-with-shortage RPC remains the final settlement operation.
-- Permit it to close an OC that previously had one or more partial receipts.
do $migration$
declare
  v_definition text;
  v_pattern text := 'v_order[.]status <> ''IN_TRANSIT''';
  v_count integer;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'persist_purchase_fiscal_state'
    and p.pronargs = 18;
  if v_definition is null then
    raise exception 'Falta persist_purchase_fiscal_state';
  end if;
  select count(*) into v_count from regexp_matches(v_definition, v_pattern, 'g');
  if v_count <> 1 then
    raise exception 'No se pudo ampliar el estado permitido de la recepción';
  end if;
  execute regexp_replace(v_definition, v_pattern,
    'v_order.status not in (''IN_TRANSIT'', ''PARTIALLY_RECEIVED'')');
end;
$migration$;

-- Move only quote quantities actually received into an actionable child order.
-- The purchasing order retains the remaining quote lines and the OC link.
create or replace function public.release_purchase_receipt_to_order(
  p_org_id uuid, p_receipt_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_receipt public.purchase_receipts%rowtype;
  v_order public.orders%rowtype;
  v_parent public.orders%rowtype;
  v_ready uuid := gen_random_uuid();
  v_parent_id uuid;
  v_line record;
  v_quote public.quote_items%rowtype;
  v_variant record;
  v_variant_id uuid;
  v_available numeric;
  v_allocated numeric;
  v_created uuid;
  v_quantity numeric;
  v_unit_subtotal numeric;
  v_unit_discount numeric;
  v_tax record;
  v_tax_base numeric;
  v_tax_amount numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.purchase_item_tax_access(p_org_id, true), false) then
    raise exception 'Sin permisos para actualizar la recepción';
  end if;
  select * into v_receipt from public.purchase_receipts
    where id = p_receipt_id and organization_id = p_org_id for update;
  if not found then raise exception 'Recepción no encontrada'; end if;
  if v_receipt.order_released_at is not null then return v_receipt.ready_order_id; end if;
  select * into v_order from public.orders where organization_id = p_org_id
    and purchase_order_id = v_receipt.purchase_order_id for update;
  if not found then
    update public.purchase_receipts set order_released_at = now()
      where id = p_receipt_id;
    return null;
  end if;
  if v_order.status not in ('PURCHASING', 'GOODS_RECEIVED') then
    raise exception 'El pedido vinculado no está en compra';
  end if;
  v_parent_id := coalesce(v_order.parent_order_id, v_order.id);
  select * into v_parent from public.orders where id = v_parent_id
    and organization_id = p_org_id for update;

  if v_order.parent_order_id is null then
    -- The direct purchase sits on the parent; make its remaining work a child.
    if exists (
      select 1 from public.purchase_receipt_items pri
      join public.quote_items qi on qi.quote_id = v_order.quote_id
        and qi.product_id = pri.product_id and qi.assigned_order_id is null
      where pri.receipt_id = p_receipt_id and not pri.is_extra
    ) then
      update public.orders set purchase_order_id = null
        where id = v_parent_id and organization_id = p_org_id;
      insert into public.orders (
        organization_id, quote_id, parent_order_id, order_number,
        status, purchase_order_id, created_by
      ) values (
        p_org_id, v_order.quote_id, v_order.id,
        v_order.order_number || '-COMPRA-' || substr(p_receipt_id::text, 1, 6),
        'PURCHASING', v_receipt.purchase_order_id, v_parent.created_by
      ) returning * into v_order;
      update public.quote_items set assigned_order_id = v_order.id
        where quote_id = v_order.quote_id and assigned_order_id is null
          and product_id in (select poi.product_id from public.purchase_order_items poi
            where poi.purchase_order_id = v_receipt.purchase_order_id
              and poi.organization_id = p_org_id
              and exists (select 1 from public.purchase_receipt_ordered_items original
                where original.id = poi.id and original.organization_id = p_org_id));
    else
      update public.purchase_receipts set order_released_at = now()
        where id = p_receipt_id;
      return null;
    end if;
  end if;

  insert into public.orders (
    id, organization_id, quote_id, parent_order_id, order_number, status, created_by
  ) values (
    v_ready, p_org_id, v_order.quote_id, v_parent_id,
    v_parent.order_number || '-REC-' || substr(p_receipt_id::text, 1, 8),
    'GOODS_RECEIVED', v_parent.created_by
  );

  -- Iterate over received product/variant quantities, never over the ordered
  -- totals. Extra units bought for stock simply remain outside the sale.
  for v_line in
    select pri.*, variant.color, variant.talle, variant.qty
    from public.purchase_receipt_items pri
    left join lateral (
      select c.key as color, s.key as talle, (s.value #>> '{}')::numeric as qty
      from jsonb_each(pri.variant_stocks) c
      cross join lateral jsonb_each(c.value) s
      where (s.value #>> '{}')::numeric > 0
    ) variant on true
    where pri.receipt_id = p_receipt_id and not pri.is_extra
  loop
    if v_line.color is not null then
      select pv.id into v_variant_id from public.product_variants pv
        where pv.organization_id = p_org_id and pv.product_id = v_line.product_id
          and pv.color = v_line.color and pv.talle = v_line.talle;
    else
      v_variant_id := null;
    end if;
    v_available := coalesce(v_line.qty,
      case when v_line.quantity = 0 then v_line.unit_quantity else v_line.quantity end);
    for v_quote in select * from public.quote_items qi
      where qi.quote_id = v_order.quote_id and qi.assigned_order_id = v_order.id
        and qi.product_id = v_line.product_id
        and qi.product_variant_id is not distinct from v_variant_id
      order by qi.id for update
    loop
      exit when v_available <= 0;
      v_allocated := least(v_available, v_quote.quantity);
      if v_allocated = v_quote.quantity then
        update public.quote_items set assigned_order_id = v_ready
          where id = v_quote.id;
      else
        v_quantity := v_quote.quantity - v_allocated;
        v_unit_subtotal := trunc(v_quote.subtotal * v_allocated / v_quote.quantity, 2);
        v_unit_discount := case when v_quote.discount_amount is null then null
          else trunc(v_quote.discount_amount * v_allocated / v_quote.quantity, 2) end;
        update public.quote_items set quantity = v_quantity,
          subtotal = v_quote.subtotal - v_unit_subtotal,
          discount_amount = case when v_unit_discount is null then null
            else v_quote.discount_amount - v_unit_discount end
          where id = v_quote.id;
        insert into public.quote_items (
          quote_id, description, quantity, unit_price, subtotal,
          discount_amount, discount_percentage, product_id, product_variant_id,
          parent_quote_item_id, assigned_order_id
        ) values (
          v_quote.quote_id, v_quote.description, v_allocated, v_quote.unit_price,
          v_unit_subtotal, v_unit_discount, v_quote.discount_percentage,
          v_quote.product_id, v_quote.product_variant_id, v_quote.id, v_ready
        ) returning id into v_created;
        insert into public.quote_item_extras (quote_item_id, description, price)
          select v_created, description, price from public.quote_item_extras
          where quote_item_id = v_quote.id;
        for v_tax in select * from public.quote_item_taxes
          where quote_item_id = v_quote.id and organization_id = p_org_id
          for update
        loop
          v_tax_base := trunc(v_tax.base_amount * v_allocated / v_quote.quantity, 2);
          v_tax_amount := trunc(v_tax.tax_amount * v_allocated / v_quote.quantity, 2);
          update public.quote_item_taxes set
            base_amount = v_tax.base_amount - v_tax_base,
            tax_amount = v_tax.tax_amount - v_tax_amount
            where id = v_tax.id and organization_id = p_org_id;
          insert into public.quote_item_taxes (
            organization_id, quote_id, quote_item_id, product_id, tax_id,
            name, rate, base_amount, tax_amount, tax_code_snapshot, source
          ) values (
            p_org_id, v_quote.quote_id, v_created, v_tax.product_id, v_tax.tax_id,
            v_tax.name, v_tax.rate, v_tax_base, v_tax_amount,
            v_tax.tax_code_snapshot, v_tax.source
          );
        end loop;
      end if;
      v_available := v_available - v_allocated;
    end loop;
  end loop;

  if not exists (select 1 from public.quote_items where assigned_order_id = v_ready) then
    delete from public.orders where id = v_ready;
    v_ready := null;
  else
    insert into public.order_status_history (
      order_id, from_status, to_status, notes, changed_by
    ) values (
      v_ready, 'PURCHASING', 'GOODS_RECEIVED',
      'Mercadería recibida parcialmente de la OC ' || v_receipt.purchase_order_id,
      v_receipt.created_by
    );
  end if;
  update public.purchase_receipts
    set ready_order_id = v_ready, order_released_at = now()
    where id = p_receipt_id;
  return v_ready;
end;
$$;

revoke all on function public.release_purchase_receipt_to_order(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_purchase_receipt_to_order(uuid, uuid)
  to service_role;

-- Finish the technical purchasing segment without declaring unreceived goods
-- available. Preserve received children, release shortages to stock review.
create or replace function public.finalize_purchase_receipt_order(
  p_org_id uuid, p_receipt_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_receipt public.purchase_receipts%rowtype;
  v_order public.orders%rowtype;
  v_parent public.orders%rowtype;
  v_next_status public.order_flow_status;
  v_unassigned boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'La finalización requiere un servicio autorizado';
  end if;
  select * into v_receipt from public.purchase_receipts
    where id = p_receipt_id and organization_id = p_org_id for update;
  if not found or not v_receipt.close_purchase or v_receipt.order_released_at is null
    or not exists (select 1 from public.purchase_orders po
      where po.id = v_receipt.purchase_order_id and po.organization_id = p_org_id
        and po.status = 'RECEIVED') then
    raise exception 'La compra no está lista para finalizar';
  end if;
  select * into v_order from public.orders
    where organization_id = p_org_id
      and purchase_order_id = v_receipt.purchase_order_id for update;
  if not found then return; end if; -- OC creada directamente, sin pedido.
  if v_order.status in ('CANCELLED', 'PENDING_STOCK') then return; end if;
  if v_order.status <> 'PURCHASING' then
    raise exception 'El subpedido vinculado no está en compra';
  end if;

  -- Only the remaining quote lines still belong to this purchasing segment.
  update public.quote_items set assigned_order_id = null
    where quote_id = v_order.quote_id and assigned_order_id = v_order.id;
  if v_order.parent_order_id is null then
    update public.orders set status = 'PENDING_STOCK', updated_at = now()
      where id = v_order.id and organization_id = p_org_id;
    insert into public.order_status_history (
      order_id, from_status, to_status, notes, changed_by
    ) values (
      v_order.id, 'PURCHASING', 'PENDING_STOCK',
      'Compra finalizada; faltantes en revisión de stock', v_receipt.created_by
    );
    return;
  end if;

  update public.orders set status = 'CANCELLED', updated_at = now()
    where id = v_order.id and organization_id = p_org_id;
  insert into public.order_status_history (
    order_id, from_status, to_status, notes, changed_by
  ) values (
    v_order.id, 'PURCHASING', 'CANCELLED',
    'Tramo de compra cerrado; el faltante vuelve a revisión de stock',
    v_receipt.created_by
  );

  select * into v_parent from public.orders
    where id = v_order.parent_order_id and organization_id = p_org_id for update;
  if not found then raise exception 'Pedido padre no encontrado'; end if;
  select exists (select 1 from public.quote_items qi
    where qi.quote_id = v_parent.quote_id and qi.assigned_order_id is null)
    into v_unassigned;
  if v_unassigned then
    v_next_status := 'PENDING_STOCK';
  elsif not exists (select 1 from public.orders child
      where child.parent_order_id = v_parent.id and child.organization_id = p_org_id
        and child.status in ('PURCHASE_REQUIRED', 'PURCHASING'))
    and exists (select 1 from public.orders child
      where child.parent_order_id = v_parent.id and child.organization_id = p_org_id
        and child.status = 'GOODS_RECEIVED') then
    v_next_status := 'GOODS_RECEIVED';
  else
    v_next_status := null;
  end if;
  -- An already dispatched/produced parent must not be rolled back.
  if v_next_status is not null and v_parent.status in
      ('PENDING_STOCK', 'PURCHASE_REQUIRED', 'PURCHASING', 'GOODS_RECEIVED')
    and v_parent.status is distinct from v_next_status then
    update public.orders set status = v_next_status, updated_at = now()
      where id = v_parent.id and organization_id = p_org_id;
    insert into public.order_status_history (
      order_id, from_status, to_status, notes, changed_by
    ) values (
      v_parent.id, v_parent.status, v_next_status,
      'Recalculado al finalizar recepción de compra', v_receipt.created_by
    );
  end if;
end;
$$;
revoke all on function public.finalize_purchase_receipt_order(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_purchase_receipt_order(uuid, uuid)
  to service_role;

create or replace function public.complete_purchase_receipt(
  p_org_id uuid, p_receipt_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.purchase_item_tax_access(p_org_id, true), false) then
    raise exception 'Sin permisos para cerrar la recepción';
  end if;
  update public.purchase_receipts pr set finalized_at = now()
  from public.purchase_orders po
  where pr.id = p_receipt_id and pr.organization_id = p_org_id
    and pr.purchase_order_id = po.id and po.organization_id = p_org_id
    and pr.close_purchase and pr.order_released_at is not null
    and po.status = 'RECEIVED'
    and not exists (select 1 from public.orders linked
      where linked.organization_id = p_org_id
        and linked.purchase_order_id = pr.purchase_order_id
        and linked.status = 'PURCHASING');
  if not found then raise exception 'La recepción no está lista para cerrar'; end if;
end;
$$;
revoke all on function public.complete_purchase_receipt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_purchase_receipt(uuid, uuid) to service_role;
