begin;

-- UPDATE OF / WHEN trigger definitions can depend on the column type. Preserve
-- their exact definitions, comments and enabled modes while widening precision.
-- Locks and the surrounding transaction prevent writes during reconstruction;
-- any failure restores the original types and triggers through rollback.
do $$
declare
  saved_triggers jsonb;
  saved_trigger jsonb;
begin
  lock table public.supplier_invoices, public.accounts_payable,
    public.manual_fiscal_invoices in access exclusive mode;

  select coalesce(jsonb_agg(jsonb_build_object(
    'relation', format('%I.%I', n.nspname, c.relname),
    'name', t.tgname,
    'definition', pg_get_triggerdef(t.oid, false),
    'enabled', t.tgenabled,
    'comment', obj_description(t.oid, 'pg_trigger')
  ) order by n.nspname, c.relname, t.tgname), '[]'::jsonb)
  into saved_triggers
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'exchange_rate'
  where not t.tgisinternal
    and c.oid in ('public.supplier_invoices'::regclass,
      'public.accounts_payable'::regclass,
      'public.manual_fiscal_invoices'::regclass)
    and (a.attnum = any(t.tgattr::smallint[]) or exists (
      select 1 from pg_depend d
      where d.classid = 'pg_trigger'::regclass and d.objid = t.oid
        and d.refclassid = 'pg_class'::regclass
        and d.refobjid = c.oid and d.refobjsubid = a.attnum
    ));

  for saved_trigger in select value from jsonb_array_elements(saved_triggers) loop
    execute format('drop trigger %I on %s',
      saved_trigger->>'name', saved_trigger->>'relation');
  end loop;

  alter table public.supplier_invoices alter column exchange_rate type numeric;
  alter table public.accounts_payable alter column exchange_rate type numeric;
  alter table public.manual_fiscal_invoices alter column exchange_rate type numeric;

  for saved_trigger in select value from jsonb_array_elements(saved_triggers) loop
    execute saved_trigger->>'definition';
    if saved_trigger->>'enabled' <> 'O' then
      execute format('alter table %s %s trigger %I',
        saved_trigger->>'relation',
        case saved_trigger->>'enabled'
          when 'D' then 'disable'
          when 'R' then 'enable replica'
          when 'A' then 'enable always'
        end,
        saved_trigger->>'name');
    end if;
    if saved_trigger->>'comment' is not null then
      execute format('comment on trigger %I on %s is %L',
        saved_trigger->>'name', saved_trigger->>'relation', saved_trigger->>'comment');
    end if;
  end loop;
end;
$$;

-- A fiscal rate is confirmed when the invoice is registered/authorized.
-- Do not backfill or revalue historical invoices or payments.
create function public.protect_supplier_invoice_exchange_rate()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Supplier invoices are registered directly; cancellation does not unlock
  -- a quote confirmed at registration.
  if tg_op = 'UPDATE' and
    (old.currency, old.exchange_rate) is distinct from (new.currency, new.exchange_rate) then
    raise exception 'La moneda y cotización de la factura registrada son inmutables';
  end if;
  if tg_op = 'INSERT' and new.currency = 'USD' and
    (coalesce(new.exchange_rate, 0) <= 0 or
     new.exchange_rate::text in ('NaN', 'Infinity', '-Infinity')) then
    raise exception 'Ingresá una cotización fiscal válida para la factura USD';
  end if;
  return new;
end;
$$;
create trigger protect_supplier_invoice_exchange_rate
before insert or update on public.supplier_invoices
for each row execute function public.protect_supplier_invoice_exchange_rate();

create function public.protect_manual_invoice_exchange_rate()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'authorized' or nullif(to_jsonb(old)->>'arca_cae', '') is not null then
      if new.status <> 'authorized' or
        (old.currency, old.exchange_rate, old.invoice_number, old.arca_cae,
         old.arca_request_json #> '{wsfeRequest,MonCotiz}', old.arca_request_json #> '{wsfeRequest,MonId}',
         old.arca_request_json -> 'fiscalCurrency')
        is distinct from
        (new.currency, new.exchange_rate, new.invoice_number, new.arca_cae,
         new.arca_request_json #> '{wsfeRequest,MonCotiz}', new.arca_request_json #> '{wsfeRequest,MonId}',
         new.arca_request_json -> 'fiscalCurrency') then
        raise exception 'La factura autorizada y su cotización son inmutables';
      end if;
    elsif old.status = 'pending' then
      if (old.currency, old.exchange_rate,
          old.arca_request_json #> '{wsfeRequest,MonCotiz}', old.arca_request_json #> '{wsfeRequest,MonId}')
        is distinct from
        (new.currency, new.exchange_rate,
         new.arca_request_json #> '{wsfeRequest,MonCotiz}', new.arca_request_json #> '{wsfeRequest,MonId}') then
        raise exception 'La cotización de la factura en emisión es inmutable';
      end if;
      if new.status = 'authorized' and new.currency = 'USD' and (
        coalesce(new.exchange_rate, 0) <= 0 or
        new.exchange_rate::text in ('NaN', 'Infinity', '-Infinity') or
        new.exchange_rate is distinct from
          (old.arca_request_json #>> '{wsfeRequest,MonCotiz}')::numeric
      ) then
        raise exception 'La cotización autorizada debe coincidir con el comprobante enviado';
      end if;
    end if;
  end if;
  -- Normalize before entering pending, not after external authorization.
  if new.currency = 'ARS' then new.exchange_rate := null; end if;
  if new.currency = 'USD' then
    if tg_op = 'INSERT' then
      if coalesce(new.exchange_rate, 0) <= 0 or
        new.exchange_rate::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception 'Ingresá una cotización fiscal válida para la factura USD';
      end if;
    elsif new.exchange_rate is distinct from old.exchange_rate and
      (coalesce(new.exchange_rate, 0) <= 0 or
       new.exchange_rate::text in ('NaN', 'Infinity', '-Infinity')) then
      raise exception 'Ingresá una cotización fiscal válida para la factura USD';
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_manual_invoice_exchange_rate
before insert or update on public.manual_fiscal_invoices
for each row execute function public.protect_manual_invoice_exchange_rate();

create function public.protect_sale_exchange_rates()
returns trigger language plpgsql set search_path = '' as $$
declare
  old_external boolean;
  new_external boolean;
begin
  new_external := nullif(btrim(new.invoice_number), '') is not null
    and new.invoice_type::text like 'FACTURA_%';
  if tg_op = 'INSERT' then
    if new.commercial_exchange_rate is not null and (
      coalesce(new.commercial_exchange_rate, 0) <= 0 or
      new.commercial_exchange_rate::text in ('NaN', 'Infinity', '-Infinity')
    ) then
      raise exception 'Ingresá una cotización comercial válida para la venta';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if old.commercial_exchange_rate is not null and
      new.commercial_exchange_rate is distinct from old.commercial_exchange_rate then
      raise exception 'La cotización comercial acordada al crear la venta es inmutable';
    end if;
    if new.commercial_exchange_rate is distinct from old.commercial_exchange_rate and
      new.commercial_exchange_rate is not null and (
        coalesce(new.commercial_exchange_rate, 0) <= 0 or
        new.commercial_exchange_rate::text in ('NaN', 'Infinity', '-Infinity')
      ) then
      raise exception 'Ingresá una cotización comercial válida para la venta';
    end if;
    if old.arca_status = 'authorized' or nullif(to_jsonb(old)->>'arca_cae', '') is not null then
      if new.arca_status is distinct from 'authorized' or
        (old.currency, old.exchange_rate, old.invoice_number, old.invoice_type, old.arca_cae,
         old.arca_request_json #> '{wsfeRequest,MonCotiz}', old.arca_request_json #> '{wsfeRequest,MonId}', old.arca_request_json -> 'fiscalCurrency')
        is distinct from
        (new.currency, new.exchange_rate, new.invoice_number, new.invoice_type, new.arca_cae,
         new.arca_request_json #> '{wsfeRequest,MonCotiz}', new.arca_request_json #> '{wsfeRequest,MonId}', new.arca_request_json -> 'fiscalCurrency') then
        raise exception 'La factura autorizada y su cotización son inmutables';
      end if;
    elsif old.arca_status = 'pending' then
      if old.currency is distinct from new.currency or
        (old.arca_request_json #> '{wsfeRequest,MonCotiz}', old.arca_request_json #> '{wsfeRequest,MonId}')
        is distinct from
        (new.arca_request_json #> '{wsfeRequest,MonCotiz}', new.arca_request_json #> '{wsfeRequest,MonId}') then
        raise exception 'La cotización del comprobante en emisión es inmutable';
      end if;
      if new.arca_status = 'authorized' then
        if new.currency = 'USD' and (
          coalesce(new.exchange_rate, 0) <= 0 or
          new.exchange_rate::text in ('NaN', 'Infinity', '-Infinity') or
          new.exchange_rate is distinct from
            (old.arca_request_json #>> '{wsfeRequest,MonCotiz}')::numeric
        ) then
          raise exception 'La cotización autorizada debe coincidir con el comprobante enviado';
        end if;
      elsif new.exchange_rate is distinct from old.exchange_rate then
        raise exception 'La cotización de la factura en emisión es inmutable';
      end if;
    end if;
    old_external := nullif(btrim(old.invoice_number), '') is not null
      and old.invoice_type::text like 'FACTURA_%';
    if old_external and
      (old.currency, old.exchange_rate, old.invoice_number, old.invoice_type)
      is distinct from (new.currency, new.exchange_rate, new.invoice_number, new.invoice_type) then
      raise exception 'La cotización de la factura registrada es inmutable';
    end if;
    if old.arca_request_json ? 'fiscalRateConfirmedAt' then
      new.arca_request_json := coalesce(new.arca_request_json, '{}'::jsonb) ||
        jsonb_build_object('fiscalRateConfirmedAt', old.arca_request_json -> 'fiscalRateConfirmedAt');
    end if;
  end if;
  if new_external and new.currency = 'USD' and old_external is not true and
    (coalesce(new.exchange_rate, 0) <= 0 or new.exchange_rate::text in ('NaN', 'Infinity', '-Infinity')) then
    raise exception 'Confirmá la cotización fiscal al registrar la factura USD';
  end if;
  if new_external and coalesce(new.arca_status, '') not in ('pending', 'authorized') and
    not (coalesce(new.arca_request_json, '{}'::jsonb) ? 'fiscalRateConfirmedAt') then
    new.arca_request_json := coalesce(new.arca_request_json, '{}'::jsonb) ||
      jsonb_build_object('fiscalRateConfirmedAt', now());
  end if;
  return new;
end;
$$;
create trigger protect_sale_exchange_rates
before insert or update on public.sales_orders
for each row execute function public.protect_sale_exchange_rates();

-- Keep invoice registration, its confirmed quote, edited lines and tax snapshots
-- in a single transaction. Reuse the existing extras-preserving item machinery.
create function public.update_sale_order_with_fiscal_quote_atomic(
  p_org_id uuid, p_sale_id uuid, p_patch jsonb, p_items jsonb,
  p_item_taxes jsonb, p_taxes jsonb
)
returns public.sales_orders
language plpgsql security invoker set search_path = '' as $$
declare
  v_sale public.sales_orders%rowtype;
  v_updated public.sales_orders%rowtype;
  v_member record;
  v_manage_all boolean;
  v_patch jsonb;
begin
  if jsonb_typeof(p_patch) <> 'object' or jsonb_typeof(p_items) <> 'array'
    or jsonb_typeof(p_item_taxes) <> 'array' or jsonb_typeof(p_taxes) <> 'array' then
    raise exception 'Datos de edición inválidos';
  end if;
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Usuario no autenticado';
  end if;
  select * into v_member from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = auth.uid() and m.is_active;
  if not found then
    raise exception using errcode = '42501', message = 'Sin acceso a la organización';
  end if;
  v_manage_all := coalesce(v_member.is_owner, false)
    or public.user_has_org_permission('sales.manage.all', p_org_id)
    or public.user_has_org_permission('organization.admin', p_org_id);
  if not (v_manage_all or public.user_has_org_permission('sales.manage', p_org_id)) then
    raise exception using errcode = '42501', message = 'Sin permiso para gestionar ventas';
  end if;
  select * into v_sale from public.sales_orders s
    where s.id = p_sale_id and s.organization_id = p_org_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if not v_manage_all and (v_sale.user_id is distinct from auth.uid() or
    coalesce((p_patch->>'user_id')::uuid, v_sale.user_id) is distinct from auth.uid()) then
    raise exception using errcode = '42501', message = 'Solo podés gestionar tus ventas';
  end if;
  if v_sale.arca_status in ('pending', 'authorized') or v_sale.status = 'CANCELLED'
    or v_sale.document_type <> 'STANDARD' then
    raise exception 'La venta no admite cambios fiscales';
  end if;
  if p_patch->>'customer_id' is not null and not exists (
    select 1 from public.customers c where c.id = (p_patch->>'customer_id')::uuid and c.organization_id = p_org_id
  ) then raise exception 'Cliente de otra organización'; end if;
  if p_patch->>'user_id' is not null and not exists (
    select 1 from public.organization_members m where m.user_id = (p_patch->>'user_id')::uuid
      and m.organization_id = p_org_id and m.is_active
  ) then raise exception 'Vendedor no disponible en la organización'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where item->>'productId' is not null and not exists (
      select 1 from public.products p where p.id = (item->>'productId')::uuid and p.organization_id = p_org_id
    )
  ) then raise exception 'Producto de otra organización'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_taxes || p_item_taxes) tax
    where tax->>'tax_id' is not null and not exists (
      select 1 from public.taxes t where t.id = (tax->>'tax_id')::uuid and t.organization_id = p_org_id
    )
  ) then raise exception 'Impuesto de otra organización'; end if;

  -- Do not register the external invoice number in the inner RPC. The final
  -- header update below confirms number and quote together, after all checks.
  v_sale := public.update_sale_order_with_extras_atomic(
    p_org_id, p_sale_id, (p_patch->>'customer_id')::uuid, (p_patch->>'user_id')::uuid,
    (p_patch->>'sale_date')::date, (p_patch->>'expiration_date')::date,
    (p_patch->>'credit_days')::integer, (p_patch->>'invoice_type')::public.invoice_type,
    null::text, p_patch->>'observations', (p_patch->>'global_discount_percentage')::numeric,
    p_items, '[]'::jsonb
  );
  if exists (
    select 1 from jsonb_array_elements(p_item_taxes) tax where not exists (
      select 1 from public.sales_order_items i where i.id = (tax->>'sales_order_item_id')::uuid
        and i.sales_order_id = p_sale_id and i.organization_id = p_org_id
    )
  ) then raise exception 'Snapshot de impuesto de otro documento'; end if;
  delete from public.sales_order_item_taxes where sales_order_id = p_sale_id and organization_id = p_org_id;
  delete from public.sales_order_taxes where sales_order_id = p_sale_id and organization_id = p_org_id;
  insert into public.sales_order_taxes (organization_id, sales_order_id, tax_id, name, rate, base_amount, tax_amount, tax_code_snapshot)
    select p_org_id, p_sale_id, t.tax_id, t.name, t.rate, t.base_amount, t.tax_amount, t.tax_code_snapshot
    from jsonb_to_recordset(p_taxes) as t(tax_id uuid, name text, rate numeric, base_amount numeric, tax_amount numeric, tax_code_snapshot text);
  insert into public.sales_order_item_taxes (organization_id, sales_order_id, sales_order_item_id, product_id,
    tax_id, name, rate, base_amount, tax_amount, tax_code_snapshot, source)
    select p_org_id, p_sale_id, i.id, i.product_id, t.tax_id, t.name, t.rate, t.base_amount, t.tax_amount, t.tax_code_snapshot, t.source
    from jsonb_to_recordset(p_item_taxes) as t(sales_order_item_id uuid, tax_id uuid, name text, rate numeric,
      base_amount numeric, tax_amount numeric, tax_code_snapshot text, source text)
    join public.sales_order_items i on i.id = t.sales_order_item_id and i.sales_order_id = p_sale_id and i.organization_id = p_org_id;
  v_patch := p_patch - 'id' - 'organization_id' - 'created_at' - 'status' - 'document_type' - 'currency';
  v_updated := jsonb_populate_record(v_sale, v_patch);
  v_updated.updated_at := now();
  update public.sales_orders s set
    customer_id = v_updated.customer_id,
    user_id = v_updated.user_id,
    sale_date = v_updated.sale_date,
    expiration_date = v_updated.expiration_date,
    credit_days = v_updated.credit_days,
    invoice_type = v_updated.invoice_type,
    invoice_number = v_updated.invoice_number,
    observations = v_updated.observations,
    global_discount_percentage = v_updated.global_discount_percentage,
    sub_total = v_updated.sub_total,
    total_tax_amount = v_updated.total_tax_amount,
    global_discount_amount = v_updated.global_discount_amount,
    total_amount = v_updated.total_amount,
    commercial_exchange_rate = v_updated.commercial_exchange_rate,
    exchange_rate = v_updated.exchange_rate,
    remittance_number = v_updated.remittance_number,
    sales_price_list_id = v_updated.sales_price_list_id,
    price_level_id = v_updated.price_level_id,
    warehouse_id = v_updated.warehouse_id,
    advance_payment_percentage = v_updated.advance_payment_percentage,
    arca_status = v_updated.arca_status,
    arca_last_error = v_updated.arca_last_error,
    arca_request_json = v_updated.arca_request_json,
    arca_response_json = v_updated.arca_response_json,
    arca_point_of_sale = v_updated.arca_point_of_sale,
    arca_voucher_number = v_updated.arca_voucher_number,
    arca_voucher_type_code = v_updated.arca_voucher_type_code,
    arca_cae = v_updated.arca_cae,
    arca_cae_expires_at = v_updated.arca_cae_expires_at,
    arca_authorized_at = v_updated.arca_authorized_at,
    updated_at = now()
    where s.id = p_sale_id and s.organization_id = p_org_id returning * into v_sale;
  return v_sale;
end;
$$;
revoke all on function public.update_sale_order_with_fiscal_quote_atomic(uuid, uuid, jsonb, jsonb, jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.update_sale_order_with_fiscal_quote_atomic(uuid, uuid, jsonb, jsonb, jsonb, jsonb)
  to authenticated;

-- Return native currency components. The commercial quote is applied once by
-- the presentation layer, never by mixing native ARS and USD cost amounts.
create or replace function public.get_inventory_stock_metrics(
  p_org_id uuid,
  p_warehouse_id uuid default null
)
returns jsonb
language plpgsql stable security invoker set search_path = ''
set plan_cache_mode = force_custom_plan as $$
declare
  v_access record;
  v_result jsonb;
begin
  if p_org_id is null then
    raise exception using errcode = '22023', message = 'Organización inválida';
  end if;
  select * into v_access from public.get_inventory_stock_read_context(p_org_id);
  if not found then
    raise exception using errcode = '42501', message = 'Sin acceso a la organización';
  end if;
  if not (v_access.can_read_inventory or v_access.can_read_mercadolibre) then
    raise exception using errcode = '42501', message = 'Sin permiso para consultar inventario';
  end if;
  if p_warehouse_id is not null and not public.can_access_warehouse(p_org_id, p_warehouse_id) then
    raise exception using errcode = '42501', message = 'Depósito no disponible para tu usuario';
  end if;

  with stock as materialized (
    select p.id, p.is_active, p.min_stock, p.unit_of_measure::text as unit_of_measure,
      b.quantity_available as quantity
    from public.get_inventory_stock_balances(p_org_id, null::uuid[], p_warehouse_id) b
    join public.products p on p.id = b.product_id and p.organization_id = p_org_id
  ), priced as (
    select s.*, price.cost_price, price.currency
    from stock s
    left join lateral (
      select pw.cost_price, pw.currency
      from public.products_with_price pw
      where v_access.can_view_costs and s.is_active and s.quantity > 0
        and pw.organization_id = p_org_id and pw.id = s.id
    ) price on true
  )
  select jsonb_build_object(
    'warehouseScoped', p_warehouse_id is not null,
    'canViewCosts', v_access.can_view_costs,
    'totalProducts', count(*) filter (where p_warehouse_id is null or s.quantity > 0),
    'activeProducts', count(*) filter (where s.is_active and (p_warehouse_id is null or s.quantity > 0)),
    'inactiveProducts', count(*) filter (where not s.is_active and (p_warehouse_id is null or s.quantity > 0)),
    'totalUnits', coalesce(sum(s.quantity) filter (
      where s.is_active and s.quantity > 0
        and coalesce(s.unit_of_measure, '') not in ('KG', 'LT')
    ), 0),
    'totalKg', round(coalesce(sum(s.quantity) filter (
      where s.is_active and s.quantity > 0 and s.unit_of_measure = 'KG'
    ), 0), 1),
    'totalLt', round(coalesce(sum(s.quantity) filter (
      where s.is_active and s.quantity > 0 and s.unit_of_measure = 'LT'
    ), 0), 1),
    'lowStockCount', count(*) filter (
      where s.is_active and s.quantity > 0 and s.quantity <= s.min_stock
    )
  ) || case when v_access.can_view_costs then jsonb_build_object(
    'totalStockValue', coalesce(sum(s.quantity * s.cost_price) filter (
      where s.is_active and s.quantity > 0 and s.currency = 'ARS'
    ), 0),
    'totalStockValueUsd', coalesce(sum(s.quantity * s.cost_price) filter (
      where s.is_active and s.quantity > 0 and s.currency = 'USD'
    ), 0),
    'unpricedStockProducts', count(*) filter (
      where s.is_active and s.quantity > 0 and
        (s.cost_price is null or s.currency is null or s.currency not in ('ARS', 'USD'))
    )
  ) else '{}'::jsonb end
  into v_result
  from priced s;
  return v_result;
end;
$$;

commit;
