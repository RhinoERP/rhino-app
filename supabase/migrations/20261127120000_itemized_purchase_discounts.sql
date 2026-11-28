begin;

-- Opt-in JSONB settings default to false when absent:
-- purchase_discounts_enabled and post_invoice_discounts_include_taxes.
do $$
begin
  if to_regprocedure('public.import_price_list(uuid,uuid,text,date,jsonb,text)') is null
    or to_regprocedure('public.persist_purchase_fiscal_state(uuid,uuid,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,numeric,jsonb,uuid,date,date,text,public.purchase_order_status,date)') is null
    or to_regprocedure('public.can_access_sales_pricing(uuid,boolean)') is null then
    raise exception 'Faltan las funciones base de listas de precios o compras; aplicar las migraciones previas';
  end if;
end;
$$;

create type public.purchase_discount_method as enum ('additive', 'sequential');

alter table public.price_lists
  add column habitual_discount_method public.purchase_discount_method not null default 'sequential';

-- list_price is commercial (CAJA means per box); cost_price stays the habitual
-- net cost consumed by the existing price views. NULL marks legacy list items.
alter table public.price_list_items
  add column list_price numeric,
  add column discount_1_percentage numeric not null default 0,
  add column discount_2_percentage numeric not null default 0,
  add column discount_3_percentage numeric not null default 0,
  add column discount_4_percentage numeric not null default 0,
  add column discount_5_percentage numeric not null default 0,
  add constraint price_list_items_list_price_check
    check (list_price is null or (list_price >= 0 and list_price < 'Infinity'::numeric)),
  add constraint price_list_items_habitual_discounts_check check (
    discount_1_percentage between 0 and 100 and discount_2_percentage between 0 and 100
    and discount_3_percentage between 0 and 100 and discount_4_percentage between 0 and 100
    and discount_5_percentage between 0 and 100
  );

-- Preserve the inputs used by a purchase, independently of later list changes.
-- list_unit_cost uses the transaction's base unit, just like unit_cost. These
-- are not the future alternative-cost scenario or lot-cost snapshots.
alter table public.purchase_order_items
  add column list_unit_cost numeric,
  add column habitual_discount_method public.purchase_discount_method not null default 'sequential',
  add column discount_1_percentage numeric not null default 0,
  add column discount_2_percentage numeric not null default 0,
  add column discount_3_percentage numeric not null default 0,
  add column discount_4_percentage numeric not null default 0,
  add column discount_5_percentage numeric not null default 0,
  add column post_invoice_prompt_payment_discount_percentage numeric not null default 0,
  add column post_invoice_volume_discount_percentage numeric not null default 0,
  add column post_invoice_goods_discount_percentage numeric not null default 0,
  add column post_invoice_discounts_include_taxes boolean not null default false,
  add constraint purchase_order_items_list_unit_cost_check
    check (list_unit_cost is null or (list_unit_cost >= 0 and list_unit_cost < 'Infinity'::numeric)),
  add constraint purchase_order_items_habitual_discounts_check check (
    discount_1_percentage between 0 and 100 and discount_2_percentage between 0 and 100
    and discount_3_percentage between 0 and 100 and discount_4_percentage between 0 and 100
    and discount_5_percentage between 0 and 100
    and (habitual_discount_method <> 'additive' or
      discount_1_percentage + discount_2_percentage + discount_3_percentage
        + discount_4_percentage + discount_5_percentage < 100)
    and (list_unit_cost is not null or
      discount_1_percentage + discount_2_percentage + discount_3_percentage
        + discount_4_percentage + discount_5_percentage = 0)
  ),
  add constraint purchase_order_items_post_invoice_discounts_check check (
    post_invoice_prompt_payment_discount_percentage between 0 and 100
    and post_invoice_volume_discount_percentage between 0 and 100
    and post_invoice_goods_discount_percentage between 0 and 100
  );

-- Exact intermediates; truncate only the final monetary result at the caller.
create function public.calculate_habitual_purchase_cost(
  p_list_price numeric,
  p_method public.purchase_discount_method,
  p_discount_1 numeric default 0,
  p_discount_2 numeric default 0,
  p_discount_3 numeric default 0,
  p_discount_4 numeric default 0,
  p_discount_5 numeric default 0
)
returns numeric language plpgsql immutable parallel safe set search_path = '' as $$
declare
  v_discount numeric;
  v_total numeric := 0;
  v_result numeric := p_list_price;
begin
  if p_list_price is null or not (p_list_price >= 0 and p_list_price < 'Infinity'::numeric)
    or p_method is null then
    raise exception 'Precio de lista o método de descuentos inválido';
  end if;
  foreach v_discount in array array[
    coalesce(p_discount_1, 0), coalesce(p_discount_2, 0), coalesce(p_discount_3, 0),
    coalesce(p_discount_4, 0), coalesce(p_discount_5, 0)
  ] loop
    if not (v_discount between 0 and 100) then
      raise exception 'Cada descuento debe estar entre 0 y 100';
    end if;
    v_total := v_total + v_discount;
    v_result := v_result * (1 - v_discount / 100);
  end loop;
  if p_method = 'additive' then
    if v_total >= 100 then
      raise exception 'La suma de los descuentos habituales debe ser menor al 100%%';
    end if;
    return p_list_price * (1 - v_total / 100);
  end if;
  return v_result;
end;
$$;

-- RPCs acquire this per-list lock before touching any row. A legacy direct DML
-- statement may already own a row lock when its trigger runs: it must fail fast
-- instead of waiting in the opposite order and forming a deadlock.
create function public.try_lock_price_list_discount_write(p_list_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_key bigint;
begin
  if p_list_id is null then raise exception 'Lista de precios no encontrada'; end if;
  v_key := pg_catalog.hashtextextended('price-list-discounts:' || p_list_id::text, 0);
  if not pg_catalog.pg_try_advisory_xact_lock(v_key) then
    raise exception using errcode = '40001',
      message = 'La lista de precios está siendo actualizada; reintentá la operación';
  end if;
end;
$$;

create function public.coordinate_price_list_discount_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.habitual_discount_method = old.habitual_discount_method then return new; end if;
  end if;
  perform public.try_lock_price_list_discount_write(old.id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger coordinate_price_list_discount_write
before update of habitual_discount_method or delete on public.price_lists
for each row execute function public.coordinate_price_list_discount_write();

create function public.enforce_price_list_habitual_discounts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
  v_method public.purchase_discount_method;
  v_enabled boolean;
  v_requires_enabled boolean := true;
  v_factor numeric;
  v_target numeric;
begin
  if new.list_price is null then
    if new.discount_1_percentage + new.discount_2_percentage + new.discount_3_percentage
      + new.discount_4_percentage + new.discount_5_percentage <> 0 then
      raise exception 'Debe indicar el precio de lista antes de aplicar descuentos habituales';
    end if;
    if tg_op = 'INSERT' then return new; end if;
    if old.list_price is null then return new; end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.price_list_id is distinct from new.price_list_id then
      perform public.try_lock_price_list_discount_write(old.price_list_id);
    end if;
    -- Editing a price is still supported after disabling the feature; changing
    -- the discount inputs, moving an item, or discarding its detail is not.
    v_requires_enabled := old.list_price is null or new.list_price is null
      or row(new.discount_1_percentage, new.discount_2_percentage, new.discount_3_percentage,
        new.discount_4_percentage, new.discount_5_percentage, new.price_list_id)
        is distinct from row(old.discount_1_percentage, old.discount_2_percentage,
          old.discount_3_percentage, old.discount_4_percentage, old.discount_5_percentage, old.price_list_id);
  end if;

  perform public.try_lock_price_list_discount_write(new.price_list_id);
  select organization_id, habitual_discount_method into v_org_id, v_method
  from public.price_lists where id = new.price_list_id for update;
  if not found then raise exception 'Lista de precios no encontrada'; end if;
  select exists (select 1 from public.organization_settings
    where organization_id = v_org_id and settings->'purchase_discounts_enabled' = 'true'::jsonb)
  into v_enabled;
  if not v_enabled and v_requires_enabled then
    raise exception 'Los descuentos desglosados de compra no están habilitados para la organización';
  end if;
  if new.list_price is null then return new; end if;

  if tg_op = 'UPDATE' then
    if not v_requires_enabled and new.list_price is not distinct from old.list_price
      and new.cost_price is distinct from old.cost_price then
      -- Legacy editors submit the net cost, not the original list price. Keep
      -- the stored discounts and derive a gross price that produces that net.
      if new.cost_price is null or not (new.cost_price >= 0 and new.cost_price < 'Infinity'::numeric) then
        raise exception 'El precio debe ser un importe válido mayor o igual a cero';
      end if;
      v_target := trunc(new.cost_price, 2);
      v_factor := public.calculate_habitual_purchase_cost(1, v_method,
        new.discount_1_percentage, new.discount_2_percentage, new.discount_3_percentage,
        new.discount_4_percentage, new.discount_5_percentage);
      if v_factor = 0 then
        if v_target <> 0 then
          raise exception 'No se puede asignar un costo neto positivo manteniendo un descuento del 100%%';
        end if;
      else
        new.list_price := v_target / v_factor;
        if trunc(public.calculate_habitual_purchase_cost(new.list_price, v_method,
          new.discount_1_percentage, new.discount_2_percentage, new.discount_3_percentage,
          new.discount_4_percentage, new.discount_5_percentage), 2) < v_target then
          -- Numeric division may repeat. A value inside the target cent's
          -- interval avoids dropping a cent when the final result is truncated.
          new.list_price := (v_target + 0.005) / v_factor;
        end if;
      end if;
    end if;
  end if;

  new.cost_price := trunc(public.calculate_habitual_purchase_cost(
    new.list_price, v_method, new.discount_1_percentage, new.discount_2_percentage,
    new.discount_3_percentage, new.discount_4_percentage, new.discount_5_percentage), 2);
  if v_target is not null and new.cost_price <> v_target then
    raise exception 'No se pudo representar el precio neto solicitado con los descuentos actuales';
  end if;
  return new;
end;
$$;

create function public.enforce_price_list_discount_method()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.habitual_discount_method = old.habitual_discount_method then return new; end if;
  elsif new.habitual_discount_method = 'sequential' then
    return new;
  end if;
  if not exists (select 1 from public.organization_settings
    where organization_id = new.organization_id and settings->'purchase_discounts_enabled' = 'true'::jsonb) then
    raise exception 'Los descuentos desglosados de compra no están habilitados para la organización';
  end if;
  perform public.try_lock_price_list_discount_write(new.id);
  update public.price_list_items set list_price = list_price
  where price_list_id = new.id and list_price is not null;
  return new;
end;
$$;

create trigger enforce_price_list_habitual_discounts
before insert or update on public.price_list_items
for each row execute function public.enforce_price_list_habitual_discounts();

create trigger enforce_price_list_discount_method
after insert or update of habitual_discount_method on public.price_lists
for each row execute function public.enforce_price_list_discount_method();

-- Keep legacy import callers intact and save gross prices + discounts in one
-- transaction for organizations that explicitly enabled itemized discounts.
create function public.import_price_list_with_discounts(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_name text,
  p_valid_from date,
  p_items jsonb,
  p_habitual_discount_method public.purchase_discount_method,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_items jsonb;
  v_result jsonb;
  v_list_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.can_access_sales_pricing(p_organization_id, true), false) then
    raise exception using errcode = '42501', message = 'Sin permiso para gestionar listas de precios';
  end if;
  if not exists (select 1 from public.organization_settings
    where organization_id = p_organization_id and settings->'purchase_discounts_enabled' = 'true'::jsonb) then
    raise exception 'Los descuentos desglosados de compra no están habilitados para la organización';
  end if;
  if not exists (select 1 from public.suppliers
    where id = p_supplier_id and organization_id = p_organization_id) then
    raise exception 'El proveedor no pertenece a la organización';
  end if;
  if nullif(btrim(p_name), '') is null or p_valid_from is null or p_habitual_discount_method is null then
    raise exception 'Nombre, vigencia y método de descuentos son obligatorios';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Los productos deben ser un arreglo';
  end if;
  if jsonb_array_length(p_items) = 0 or exists (
    select 1 from jsonb_array_elements(p_items) x
    where jsonb_typeof(x) <> 'object' or nullif(btrim(x->>'sku'), '') is null
  ) then
    raise exception 'Debe indicar productos con SKU';
  end if;
  if (select count(*) <> count(distinct btrim(x->>'sku')) from jsonb_array_elements(p_items) x) then
    raise exception 'La lista contiene SKU duplicados';
  end if;
  select jsonb_agg(x || jsonb_build_object('sku', btrim(x->>'sku'), 'price',
    trunc(public.calculate_habitual_purchase_cost(
      (x->>'price')::numeric, p_habitual_discount_method,
      (x->>'discount_1_percentage')::numeric, (x->>'discount_2_percentage')::numeric,
      (x->>'discount_3_percentage')::numeric, (x->>'discount_4_percentage')::numeric,
      (x->>'discount_5_percentage')::numeric
    ), 2)) order by ordinality) into v_items
  from jsonb_array_elements(p_items) with ordinality as item(x, ordinality);
  v_result := public.import_price_list(
    p_organization_id, p_supplier_id, p_name, p_valid_from, v_items, p_notes
  );
  v_list_id := (v_result->>'price_list_id')::uuid;
  if v_list_id is null then raise exception 'La importación no devolvió una lista de precios'; end if;
  update public.price_lists set habitual_discount_method = p_habitual_discount_method
  where id = v_list_id and organization_id = p_organization_id;
  update public.price_list_items pli set
    list_price = (x->>'price')::numeric,
    discount_1_percentage = coalesce((x->>'discount_1_percentage')::numeric, 0),
    discount_2_percentage = coalesce((x->>'discount_2_percentage')::numeric, 0),
    discount_3_percentage = coalesce((x->>'discount_3_percentage')::numeric, 0),
    discount_4_percentage = coalesce((x->>'discount_4_percentage')::numeric, 0),
    discount_5_percentage = coalesce((x->>'discount_5_percentage')::numeric, 0)
  from jsonb_array_elements(p_items) x, public.products p
  where pli.price_list_id = v_list_id and pli.product_id = p.id
    and p.organization_id = p_organization_id and p.sku = btrim(x->>'sku');
  return v_result;
end;
$$;

-- All application list edits use the same advisory -> header -> item ordering.
-- Invoker security retains the tables' existing RLS and column privileges.
create function public.update_price_list_atomic(
  p_org_id uuid,
  p_price_list_id uuid,
  p_name text default null,
  p_valid_from date default null,
  p_habitual_discount_method public.purchase_discount_method default null
)
returns public.price_lists language plpgsql security invoker set search_path = '' as $$
declare
  v_list public.price_lists%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.can_access_sales_pricing(p_org_id, true), false) then
    raise exception using errcode = '42501', message = 'Sin permiso para gestionar listas de precios';
  end if;
  if p_name is null and p_valid_from is null and p_habitual_discount_method is null then
    raise exception 'Debe proporcionar al menos un campo para actualizar';
  end if;
  if p_name is not null and nullif(btrim(p_name), '') is null then
    raise exception 'El nombre de la lista es obligatorio';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('price-list-discounts:' || p_price_list_id::text, 0));
  select * into v_list from public.price_lists
  where id = p_price_list_id and organization_id = p_org_id for update;
  if not found then raise exception 'Lista de precios no encontrada'; end if;
  update public.price_lists set
    name = coalesce(btrim(p_name), name),
    valid_from = coalesce(p_valid_from, valid_from),
    habitual_discount_method = coalesce(p_habitual_discount_method, habitual_discount_method),
    updated_at = now()
  where id = p_price_list_id and organization_id = p_org_id returning * into v_list;
  if not found then raise exception using errcode = '42501', message = 'Sin permiso para modificar la lista'; end if;
  return v_list;
end;
$$;

create function public.update_price_list_item_discounts_atomic(
  p_org_id uuid,
  p_price_list_id uuid,
  p_item_id uuid,
  p_list_price numeric,
  p_discounts jsonb
)
returns public.price_list_items language plpgsql security invoker set search_path = '' as $$
declare
  v_method public.purchase_discount_method;
  v_item public.price_list_items%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.can_access_sales_pricing(p_org_id, true), false) then
    raise exception using errcode = '42501', message = 'Sin permiso para gestionar listas de precios';
  end if;
  if p_discounts is null or jsonb_typeof(p_discounts) <> 'object' then
    raise exception 'El detalle de descuentos debe ser un objeto';
  end if;
  if not exists (select 1 from public.organization_settings
    where organization_id = p_org_id and settings->'purchase_discounts_enabled' = 'true'::jsonb) then
    raise exception 'Los descuentos desglosados de compra no están habilitados para la organización';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('price-list-discounts:' || p_price_list_id::text, 0));
  select habitual_discount_method into v_method from public.price_lists
  where id = p_price_list_id and organization_id = p_org_id for update;
  if not found then raise exception 'Lista de precios no encontrada'; end if;
  perform public.calculate_habitual_purchase_cost(p_list_price, v_method,
    (p_discounts->>'discount_1_percentage')::numeric, (p_discounts->>'discount_2_percentage')::numeric,
    (p_discounts->>'discount_3_percentage')::numeric, (p_discounts->>'discount_4_percentage')::numeric,
    (p_discounts->>'discount_5_percentage')::numeric);
  update public.price_list_items set
    list_price = p_list_price,
    discount_1_percentage = coalesce((p_discounts->>'discount_1_percentage')::numeric, 0),
    discount_2_percentage = coalesce((p_discounts->>'discount_2_percentage')::numeric, 0),
    discount_3_percentage = coalesce((p_discounts->>'discount_3_percentage')::numeric, 0),
    discount_4_percentage = coalesce((p_discounts->>'discount_4_percentage')::numeric, 0),
    discount_5_percentage = coalesce((p_discounts->>'discount_5_percentage')::numeric, 0)
  where id = p_item_id and price_list_id = p_price_list_id returning * into v_item;
  if not found then raise exception 'Producto no encontrado en la lista'; end if;
  return v_item;
end;
$$;

-- The entire bulk operation is one transaction, including failures on later
-- items. Enabled: edit commercial list prices. Disabled: retain the existing
-- net-price editing semantics, including lists with saved discount detail.
create function public.update_price_list_prices_atomic(
  p_org_id uuid,
  p_price_list_id uuid,
  p_item_ids uuid[],
  p_price numeric default null,
  p_amount_delta numeric default null,
  p_percentage numeric default null
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_item public.price_list_items%rowtype;
  v_enabled boolean;
  v_current numeric;
  v_next numeric;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.can_access_sales_pricing(p_org_id, true), false) then
    raise exception using errcode = '42501', message = 'Sin permiso para gestionar listas de precios';
  end if;
  if coalesce(array_ndims(p_item_ids), 0) <> 1 or coalesce(cardinality(p_item_ids), 0) = 0
    or (select count(*) <> count(distinct id) from unnest(p_item_ids) as ids(id)) then
    raise exception 'Debe indicar ítems válidos sin duplicados';
  end if;
  if num_nonnulls(p_price, p_amount_delta, p_percentage) <> 1 then
    raise exception 'Debe indicar una única estrategia de actualización de precios';
  end if;
  if (p_price is not null and not (p_price >= 0 and p_price < 'Infinity'::numeric))
    or (p_amount_delta is not null and not (p_amount_delta > '-Infinity'::numeric and p_amount_delta < 'Infinity'::numeric))
    or (p_percentage is not null and not (p_percentage > -100 and p_percentage < 'Infinity'::numeric)) then
    raise exception 'El precio, ajuste o porcentaje es inválido';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('price-list-discounts:' || p_price_list_id::text, 0));
  perform 1 from public.price_lists
  where id = p_price_list_id and organization_id = p_org_id for update;
  if not found then raise exception 'Lista de precios no encontrada'; end if;
  if (select count(*) from public.price_list_items
    where price_list_id = p_price_list_id and id = any(p_item_ids)) <> cardinality(p_item_ids) then
    raise exception 'Uno o más productos no pertenecen a la lista';
  end if;
  select exists (select 1 from public.organization_settings
    where organization_id = p_org_id and settings->'purchase_discounts_enabled' = 'true'::jsonb)
  into v_enabled;
  for v_item in select * from public.price_list_items
    where price_list_id = p_price_list_id and id = any(p_item_ids) order by id for update
  loop
    v_current := case when v_enabled then coalesce(v_item.list_price, v_item.cost_price) else v_item.cost_price end;
    v_next := case when p_price is not null then p_price
      when p_amount_delta is not null then v_current + p_amount_delta
      else v_current * (1 + p_percentage / 100) end;
    if v_next is null or not (v_next >= 0 and v_next < 'Infinity'::numeric) then
      raise exception 'El precio final debe ser un importe válido mayor o igual a cero';
    end if;
    if v_enabled then
      update public.price_list_items set list_price = v_next
      where id = v_item.id and price_list_id = p_price_list_id;
    else
      update public.price_list_items set cost_price = v_next
      where id = v_item.id and price_list_id = p_price_list_id;
    end if;
    if not found then raise exception using errcode = '42501', message = 'Sin permiso para modificar un ítem de la lista'; end if;
    v_count := v_count + 1;
  end loop;
  if v_count <> cardinality(p_item_ids) then
    raise exception using errcode = '42501', message = 'Sin permiso para modificar todos los ítems de la lista';
  end if;
  return v_count;
end;
$$;

-- Preserve historical inputs by item id even when the fiscal RPC replaces rows.
-- Its internal __previous_purchase_item property is always overwritten from a
-- locked database snapshot below; callers cannot supply their own prior state.
create function public.persist_purchase_line_discounts(
  p_org_id uuid, p_purchase_order_id uuid, p_items jsonb
)
returns void language plpgsql set search_path = '' as $$
declare
  v_keys text[] := array[
    'list_unit_cost', 'habitual_discount_method', 'discount_1_percentage', 'discount_2_percentage',
    'discount_3_percentage', 'discount_4_percentage', 'discount_5_percentage',
    'post_invoice_prompt_payment_discount_percentage', 'post_invoice_volume_discount_percentage',
    'post_invoice_goods_discount_percentage', 'post_invoice_discounts_include_taxes'
  ];
  v_input jsonb;
  v_saved jsonb;
  v_current jsonb;
  v_previous jsonb;
  v_requested jsonb;
  v_next_details jsonb;
  v_item public.purchase_order_items%rowtype;
  v_next public.purchase_order_items%rowtype;
  v_enabled boolean;
begin
  select exists (select 1 from public.organization_settings
    where organization_id = p_org_id and settings->'purchase_discounts_enabled' = 'true'::jsonb)
  into v_enabled;
  for v_input in select value from jsonb_array_elements(p_items)
  loop
    select * into v_item from public.purchase_order_items
    where id = (v_input->>'id')::uuid and organization_id = p_org_id
      and purchase_order_id = p_purchase_order_id for update;
    if not found then raise exception 'Un ítem no pertenece a la compra'; end if;
    select jsonb_object_agg(key, value) into v_current
    from jsonb_each(to_jsonb(v_item)) where key = any(v_keys);
    v_previous := v_current;
    v_saved := v_input->'__previous_purchase_item';
    if jsonb_typeof(v_saved) = 'object' then
      if (v_saved->>'product_id')::uuid is not distinct from v_item.product_id then
        select v_current || coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_previous
        from jsonb_each(v_saved) where key = any(v_keys);
      end if;
    end if;
    select coalesce(jsonb_object_agg(key, case when value = 'null'::jsonb
      and key like '%\_percentage' escape '\' then '0'::jsonb else value end), '{}'::jsonb)
    into v_requested from jsonb_each(v_input) where key = any(v_keys);
    v_next := jsonb_populate_record(v_item, v_previous || v_requested);
    select jsonb_object_agg(key, value) into v_next_details
    from jsonb_each(to_jsonb(v_next)) where key = any(v_keys);
    if not v_enabled and v_next_details is distinct from v_previous then
      raise exception 'Solo se pueden conservar los descuentos existentes mientras la función está deshabilitada';
    end if;
    if v_next_details is not distinct from v_current then continue; end if;
    update public.purchase_order_items set
      list_unit_cost = v_next.list_unit_cost,
      habitual_discount_method = v_next.habitual_discount_method,
      discount_1_percentage = v_next.discount_1_percentage,
      discount_2_percentage = v_next.discount_2_percentage,
      discount_3_percentage = v_next.discount_3_percentage,
      discount_4_percentage = v_next.discount_4_percentage,
      discount_5_percentage = v_next.discount_5_percentage,
      post_invoice_prompt_payment_discount_percentage = v_next.post_invoice_prompt_payment_discount_percentage,
      post_invoice_volume_discount_percentage = v_next.post_invoice_volume_discount_percentage,
      post_invoice_goods_discount_percentage = v_next.post_invoice_goods_discount_percentage,
      post_invoice_discounts_include_taxes = v_next.post_invoice_discounts_include_taxes
    where id = v_item.id and organization_id = p_org_id and purchase_order_id = p_purchase_order_id;
  end loop;
end;
$$;

-- Patch only the deployed fiscal routine's discount integration. Keep its
-- permissions, totals, payable synchronization and receipt/state rules intact.
do $migration$
declare
  v_definition text;
  v_pattern text;
  v_count integer;
begin
  v_definition := pg_get_functiondef('public.persist_purchase_fiscal_state(uuid,uuid,text,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,numeric,jsonb,uuid,date,date,text,public.purchase_order_status,date)'::regprocedure);
  v_pattern := '\mv_order\s+public[.]purchase_orders[%]rowtype\s*;';
  select count(*) into v_count from regexp_matches(v_definition, v_pattern, 'gi');
  if v_count <> 1 or position('v_previous_purchase_items' in v_definition) > 0 then
    raise exception 'La declaración de persist_purchase_fiscal_state cambió; revisar la preservación de descuentos';
  end if;
  v_definition := regexp_replace(v_definition, v_pattern,
    'v_order public.purchase_orders%rowtype; v_previous_purchase_items jsonb;', 'i');
  v_pattern := '\mif\s+p_mode\s*=\s*''replace''\s+then\M';
  select count(*) into v_count from regexp_matches(v_definition, v_pattern, 'gi');
  if v_count <> 1 then
    raise exception 'La escritura de persist_purchase_fiscal_state cambió; revisar la preservación de descuentos';
  end if;
  v_definition := regexp_replace(v_definition, v_pattern, $capture$
    select coalesce(jsonb_object_agg(poi.id::text, to_jsonb(poi)), '{}'::jsonb)
    into v_previous_purchase_items from public.purchase_order_items poi
    where poi.purchase_order_id = p_purchase_order_id and poi.organization_id = p_org_id;
    if p_mode = 'replace' then
  $capture$, 'i');
  v_pattern := '\mreturn\s+v_order\s*;';
  select count(*) into v_count from regexp_matches(v_definition, v_pattern, 'gi');
  if v_count <> 1 then
    raise exception 'El retorno de persist_purchase_fiscal_state cambió; revisar la integración de descuentos';
  end if;
  v_definition := regexp_replace(v_definition, v_pattern, $restore$
    perform public.persist_purchase_line_discounts(p_org_id, p_purchase_order_id, (
      select jsonb_agg(line.value || jsonb_build_object('__previous_purchase_item',
        v_previous_purchase_items->(((line.value->>'id')::uuid)::text)) order by line.ordinality)
      from jsonb_array_elements(p_items) with ordinality as line(value, ordinality)
    ));
    return v_order;
  $restore$, 'i');
  execute v_definition;
end;
$migration$;

revoke all on function public.calculate_habitual_purchase_cost(numeric,public.purchase_discount_method,numeric,numeric,numeric,numeric,numeric) from public, anon;
grant execute on function public.calculate_habitual_purchase_cost(numeric,public.purchase_discount_method,numeric,numeric,numeric,numeric,numeric) to authenticated, service_role;
revoke all on function public.import_price_list_with_discounts(uuid,uuid,text,date,jsonb,public.purchase_discount_method,text) from public, anon;
grant execute on function public.import_price_list_with_discounts(uuid,uuid,text,date,jsonb,public.purchase_discount_method,text) to authenticated, service_role;
revoke all on function public.try_lock_price_list_discount_write(uuid) from public, anon, authenticated, service_role;
revoke all on function public.coordinate_price_list_discount_write() from public, anon, authenticated, service_role;
revoke all on function public.enforce_price_list_habitual_discounts() from public, anon, authenticated, service_role;
revoke all on function public.enforce_price_list_discount_method() from public, anon, authenticated, service_role;
revoke all on function public.persist_purchase_line_discounts(uuid,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.update_price_list_atomic(uuid,uuid,text,date,public.purchase_discount_method) from public, anon;
revoke all on function public.update_price_list_item_discounts_atomic(uuid,uuid,uuid,numeric,jsonb) from public, anon;
revoke all on function public.update_price_list_prices_atomic(uuid,uuid,uuid[],numeric,numeric,numeric) from public, anon;
grant execute on function public.update_price_list_atomic(uuid,uuid,text,date,public.purchase_discount_method) to authenticated, service_role;
grant execute on function public.update_price_list_item_discounts_atomic(uuid,uuid,uuid,numeric,jsonb) to authenticated, service_role;
grant execute on function public.update_price_list_prices_atomic(uuid,uuid,uuid[],numeric,numeric,numeric) to authenticated, service_role;

commit;
