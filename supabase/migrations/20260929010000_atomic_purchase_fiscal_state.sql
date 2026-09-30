-- A single transaction for purchase items, item/aggregate taxes, totals and payable.
create or replace function public.persist_purchase_fiscal_state(
  p_org_id uuid,
  p_purchase_order_id uuid,
  p_mode text,
  p_items jsonb,
  p_item_taxes jsonb,
  p_order_taxes jsonb,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_discount_percentage numeric,
  p_discount_amount numeric,
  p_total_amount numeric,
  p_fallback_taxes jsonb,
  p_supplier_id uuid,
  p_purchase_date date,
  p_expiration_date date,
  p_remittance_number text,
  p_next_status public.purchase_order_status default null,
  p_payable_due_date date default null
)
returns public.purchase_orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.purchase_orders%rowtype;
  v_payable public.accounts_payable%rowtype;
  v_paid numeric;
  v_pending numeric;
  v_payable_status public.accounts_payable.status%type;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.purchase_item_tax_access(p_org_id, true), false) then
    raise exception 'Sin permisos para modificar la compra';
  end if;
  select * into v_order from public.purchase_orders
  where id = p_purchase_order_id and organization_id = p_org_id for update;
  if not found then
    raise exception 'Compra no encontrada';
  end if;
  if (p_mode = 'replace' and v_order.status not in ('DRAFT', 'ORDERED'))
    or (p_mode = 'confirm' and v_order.status <> 'DRAFT')
    or (p_mode in ('receipt', 'receipt_legacy') and v_order.status <> 'IN_TRANSIT')
    or p_mode not in ('replace', 'confirm', 'receipt', 'receipt_legacy') then
    raise exception 'La compra no está en un estado editable para esta operación';
  end if;
  if p_next_status is not null and (p_mode <> 'confirm' or p_next_status <> 'ORDERED') then
    raise exception 'Transición de estado inválida';
  end if;
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or coalesce(jsonb_array_length(p_items), 0) = 0
    or coalesce(jsonb_typeof(p_item_taxes), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_order_taxes), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_fallback_taxes), 'null') <> 'array'
    or p_subtotal is null or p_tax_amount is null
    or p_discount_percentage is null or p_discount_amount is null
    or p_total_amount is null or p_purchase_date is null
    or p_discount_percentage < 0 or p_discount_percentage > 100
    or p_subtotal < 0 or p_tax_amount < 0 or p_total_amount < 0 then
    raise exception 'Montos o líneas de compra inválidos';
  end if;
  if (select count(*) <> count(distinct (value->>'id'))
      from jsonb_array_elements(p_items)) then
    raise exception 'Ítems duplicados';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_item_taxes) as x(
      rate numeric, base_amount numeric, tax_amount numeric
    ) where x.rate is null or x.base_amount is null or x.tax_amount is null
      or x.rate < 0 or x.base_amount < 0 or x.tax_amount < 0
  ) then
    raise exception 'Los importes por ítem no coinciden con sus alícuotas';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_order_taxes) as x(
      rate numeric, base_amount numeric, tax_amount numeric
    ) where x.rate is null or x.base_amount is null or x.tax_amount is null
      or x.rate < 0 or x.base_amount < 0 or x.tax_amount < 0
  ) then
    raise exception 'El agregado fiscal contiene importes inválidos';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier_id and s.organization_id = p_org_id
  ) then
    raise exception 'El proveedor no pertenece a la organización';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_order_taxes) as x(tax_id text)
    left join public.taxes t on t.id = nullif(x.tax_id, '')::uuid and t.organization_id = p_org_id
    where nullif(x.tax_id, '') is not null and t.id is null
  ) then
    raise exception 'El impuesto no pertenece a la organización';
  end if;

  if p_mode = 'replace' then
    delete from public.purchase_order_items
    where purchase_order_id = p_purchase_order_id and organization_id = p_org_id;
    insert into public.purchase_order_items (
      id, organization_id, purchase_order_id, product_id, quantity,
      unit_quantity, unit_cost, subtotal, variant_stocks, tax_override
    ) select x.id, p_org_id, p_purchase_order_id, x.product_id, x.quantity,
        x.unit_quantity, x.unit_cost, x.subtotal, x.variant_stocks, x.tax_override
      from jsonb_to_recordset(p_items) as x(
        id uuid, product_id uuid, quantity numeric, unit_quantity numeric,
        unit_cost numeric, subtotal numeric, variant_stocks jsonb, tax_override jsonb
      );
  else
    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(id uuid)
      left join public.purchase_order_items poi
        on poi.id = x.id and poi.organization_id = p_org_id
          and poi.purchase_order_id = p_purchase_order_id
      where poi.id is null
    ) then
      raise exception 'Un ítem no pertenece a la compra';
    end if;
    update public.purchase_order_items poi
      set quantity = x.quantity, unit_quantity = x.unit_quantity,
          unit_cost = x.unit_cost, subtotal = x.subtotal,
          variant_stocks = x.variant_stocks, tax_override = x.tax_override
      from jsonb_to_recordset(p_items) as x(
        id uuid, quantity numeric, unit_quantity numeric, unit_cost numeric,
        subtotal numeric, variant_stocks jsonb, tax_override jsonb
      )
      where poi.id = x.id and poi.organization_id = p_org_id
        and poi.purchase_order_id = p_purchase_order_id;
    if p_mode in ('receipt', 'receipt_legacy') then
      delete from public.purchase_order_items poi
      where poi.organization_id = p_org_id and poi.purchase_order_id = p_purchase_order_id
        and not exists (
          select 1 from jsonb_to_recordset(p_items) as x(id uuid) where x.id = poi.id
        );
    end if;
  end if;

  if exists (
    select 1 from public.purchase_order_items poi
    left join public.products p on p.id = poi.product_id and p.organization_id = p_org_id
    where poi.purchase_order_id = p_purchase_order_id and poi.organization_id = p_org_id
      and p.id is null
  ) then
    raise exception 'Producto ajeno a la organización';
  end if;
  if (select coalesce(sum(subtotal), 0) from public.purchase_order_items
      where organization_id = p_org_id and purchase_order_id = p_purchase_order_id) <> p_subtotal
    or p_discount_amount <> trunc(p_subtotal * p_discount_percentage / 100, 2)
    or p_total_amount <> trunc(greatest(0, p_subtotal - p_discount_amount + p_tax_amount), 2)
    or (p_mode <> 'receipt_legacy' and
        (select coalesce(sum((value->>'tax_amount')::numeric), 0)
          from jsonb_array_elements(p_item_taxes)) <> p_tax_amount)
    or (select coalesce(sum((value->>'tax_amount')::numeric), 0)
        from jsonb_array_elements(p_order_taxes)) <> p_tax_amount then
    raise exception 'Los totales fiscales no coinciden con los ítems';
  end if;

  delete from public.purchase_order_item_taxes
  where purchase_order_id = p_purchase_order_id and organization_id = p_org_id;
  delete from public.purchase_order_taxes
  where purchase_order_id = p_purchase_order_id and organization_id = p_org_id;
  insert into public.purchase_order_item_taxes (
    organization_id, purchase_order_id, purchase_order_item_id, product_id,
    tax_id, name, rate, base_amount, tax_amount, tax_code_snapshot, source
  ) select p_org_id, p_purchase_order_id, x.line_id, x.product_id,
      nullif(x.tax_id, '')::uuid, x.name, x.rate,
      x.base_amount, x.tax_amount, x.tax_code_snapshot, x.source
    from jsonb_to_recordset(p_item_taxes) as x(
      line_id uuid, product_id uuid, tax_id text, name text, rate numeric,
      base_amount numeric, tax_amount numeric, tax_code_snapshot text, source text
    );
  insert into public.purchase_order_taxes (
    organization_id, purchase_order_id, tax_id, name, rate,
    base_amount, tax_amount, tax_code_snapshot
  ) select p_org_id, p_purchase_order_id, nullif(x.tax_id, '')::uuid,
      x.name, x.rate, x.base_amount, x.tax_amount, x.tax_code_snapshot
    from jsonb_to_recordset(p_order_taxes) as x(
      tax_id text, name text, rate numeric, base_amount numeric,
      tax_amount numeric, tax_code_snapshot text
    );

  update public.purchase_orders set
    supplier_id = p_supplier_id, purchase_date = p_purchase_date,
    expiration_date = p_expiration_date,
    remittance_number = p_remittance_number,
    subtotal_amount = p_subtotal, tax_amount = p_tax_amount,
    global_discount_percentage = p_discount_percentage,
    global_discount_amount = p_discount_amount, total_amount = p_total_amount,
    fallback_taxes = p_fallback_taxes,
    tax_snapshot_initialized = case when p_mode = 'receipt_legacy'
      then tax_snapshot_initialized else true end,
    status = coalesce(p_next_status, status), updated_at = now()
  where id = p_purchase_order_id and organization_id = p_org_id
  returning * into v_order;

  if v_order.payable_origin <> 'SUPPLIER_INVOICE' and v_order.status <> 'DRAFT'
    and v_order.supplier_id is not null then
    select * into v_payable from public.accounts_payable
    where purchase_order_id = p_purchase_order_id and organization_id = p_org_id
    for update;
    if found or v_order.expiration_date is not null or p_payable_due_date is not null then
      v_paid := case when v_payable.id is null then 0
        else greatest(0, coalesce(v_payable.total_amount, 0) - coalesce(v_payable.pending_balance, 0)) end;
      v_pending := greatest(0, p_total_amount - v_paid);
      v_payable_status := case when v_pending <= 0 then 'PAID'
        when v_pending < p_total_amount then 'PARTIAL' else 'PENDING' end;
      if v_payable.id is not null then
        update public.accounts_payable set supplier_id = v_order.supplier_id,
          total_amount = p_total_amount, pending_balance = v_pending,
          due_date = coalesce(v_payable.due_date, p_payable_due_date, v_order.expiration_date, v_order.purchase_date),
          status = v_payable_status
        where id = v_payable.id and organization_id = p_org_id;
      else
        insert into public.accounts_payable (
          organization_id, supplier_id, purchase_order_id, total_amount,
          pending_balance, currency, due_date, status
        ) values (
          p_org_id, v_order.supplier_id, p_purchase_order_id, p_total_amount,
          p_total_amount, v_order.currency,
          coalesce(p_payable_due_date, v_order.expiration_date, v_order.purchase_date), 'PENDING'
        );
      end if;
    end if;
  end if;
  return v_order;
end;
$$;

revoke all on function public.persist_purchase_fiscal_state(
  uuid, uuid, text, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric,
  jsonb, uuid, date, date, text, public.purchase_order_status, date
) from public, anon;
grant execute on function public.persist_purchase_fiscal_state(
  uuid, uuid, text, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric,
  jsonb, uuid, date, date, text, public.purchase_order_status, date
) to authenticated, service_role;
