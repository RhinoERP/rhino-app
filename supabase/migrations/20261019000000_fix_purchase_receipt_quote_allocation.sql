-- Quote quantities for products sold by measure are kg/lt/m, while receipt
-- quantity counts physical units. Preserve the quote item's currency on splits.
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
    select pri.*, product.unit_of_measure, product.tracks_stock_units,
      variant.color, variant.talle, variant.qty
    from public.purchase_receipt_items pri
    join public.products product on product.id = pri.product_id
      and product.organization_id = p_org_id
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
    -- Variants allocate by units. Non-variant KG/LT/MT items without tracked
    -- stock units allocate by the received measure, if one was provided.
    v_available := coalesce(v_line.qty,
      case
        when v_line.quantity = 0 then v_line.unit_quantity
        when v_line.unit_of_measure in ('KG', 'LT', 'MT')
          and v_line.tracks_stock_units is not true
          and v_line.unit_quantity > 0 then v_line.unit_quantity
        else v_line.quantity
      end);
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
          currency, parent_quote_item_id, assigned_order_id
        ) values (
          v_quote.quote_id, v_quote.description, v_allocated, v_quote.unit_price,
          v_unit_subtotal, v_unit_discount, v_quote.discount_percentage,
          v_quote.product_id, v_quote.product_variant_id,
          v_quote.currency, v_quote.id, v_ready
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
