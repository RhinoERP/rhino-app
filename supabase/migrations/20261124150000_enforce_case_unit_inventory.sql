-- CAJA is a commercial presentation. All operational quantities remain individual
-- units. Enforce this at the write boundary, including direct authenticated RPCs.
begin;

-- Core inventory/sales dependencies must exist. Module-specific objects are
-- handled separately below so CAJA does not require WhatsApp, POS, or history.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'products', 'organization_settings', 'product_lots', 'stock_movements',
    'purchase_order_items', 'sales_order_items', 'price_lists', 'price_list_items'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Falta la dependencia central public.% para CAJA; aplicar primero las migraciones base', v_table;
    end if;
  end loop;
  if to_regprocedure('public.create_inventory_product(uuid,jsonb,jsonb,uuid[])') is null then
    raise exception 'Falta la dependencia central public.create_inventory_product para CAJA';
  end if;
  if to_regprocedure('public.user_can_admin_organization(uuid)') is null then
    raise exception 'Falta la dependencia central public.user_can_admin_organization para CAJA';
  end if;
end;
$$;

-- Retain the existing atomic creation routine, its ACL, invoker security and
-- validation. Fail closed if its allowlist has drifted instead of replacing an
-- unknown deployed function with an older copy.
do $$
declare
  v_definition text;
  v_updated text;
begin
  v_definition := pg_get_functiondef('public.create_inventory_product(uuid,jsonb,jsonb,uuid[])'::regprocedure);
  v_updated := replace(v_definition,
    'not in (''UN'', ''KG'', ''LT'', ''MT'')',
    'not in (''UN'', ''KG'', ''LT'', ''MT'', ''CAJA'')');
  if v_updated = v_definition then
    raise exception 'La validación de create_inventory_product cambió; revisar la migración de CAJA';
  end if;
  execute v_updated;
end;
$$;

alter table public.products add constraint products_case_packaging_valid check (
  unit_of_measure::text <> 'CAJA' or (
    units_per_box is not null and units_per_box > 0
    and units_per_box::text not in ('NaN', 'Infinity', '-Infinity')
    and units_per_box = trunc(units_per_box) and units_per_box <= 9007199254740991
    and not coalesce(has_variants, false) and not coalesce(tracks_stock_units, false)
  )
);

create function public.enforce_case_product_packaging()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_table text;
  v_has_history boolean;
begin
  if new.unit_of_measure::text = 'CAJA' then
    if new.units_per_box is null or new.units_per_box <= 0
      or new.units_per_box::text in ('NaN', 'Infinity', '-Infinity')
      or trunc(new.units_per_box) <> new.units_per_box
      or new.units_per_box > 9007199254740991
      or coalesce(new.has_variants, false)
      or coalesce(new.tracks_stock_units, false) then
      raise exception 'Caja requiere un factor de empaque entero positivo, sin variantes ni piezas medidas';
    end if;
    if tg_op = 'INSERT' or old.unit_of_measure::text is distinct from 'CAJA' then
      perform 1 from public.organization_settings s
        where s.organization_id = new.organization_id
          and s.settings->'case_units_enabled' = 'true'::jsonb for share;
      if not found then
        raise exception 'La unidad Caja no está habilitada para esta organización';
      end if;
    end if;
  end if;

  -- Presentation is part of this SKU's identity once used. Referencing writes
  -- take a SHARE lock below, serializing them with this UPDATE. This preserves
  -- history without reinterpreting old quantities/prices using a new factor.
  if tg_op = 'UPDATE'
    and (old.unit_of_measure::text = 'CAJA' or new.unit_of_measure::text = 'CAJA')
    and (old.unit_of_measure is distinct from new.unit_of_measure
      or old.units_per_box is distinct from new.units_per_box) then
    if exists (select 1 from public.product_lots where product_id = old.id)
      or exists (select 1 from public.purchase_order_items where product_id = old.id)
      or exists (select 1 from public.sales_order_items where product_id = old.id)
      or exists (select 1 from public.price_list_items where product_id = old.id) then
      raise exception 'No se puede cambiar la presentación de caja de un producto con existencias, precios o documentos; creá otro producto';
    end if;
    -- Resolve optional relations before preparing their queries. A static EXISTS
    -- expression still fails on an absent table when the trigger runs later.
    foreach v_table in array array[
      'pos_sale_items', 'quote_items', 'credit_note_items', 'sales_return_items',
      'historical_sales_document_items', 'pos_sales_return_items', 'conversation_cart_items'
    ] loop
      if to_regclass(format('public.%I', v_table)) is null then continue; end if;
      execute format('select exists (select 1 from public.%I where product_id = $1)', v_table)
        into v_has_history using old.id;
      if v_has_history then
        raise exception 'No se puede cambiar la presentación de caja de un producto con documentos; creá otro producto';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create trigger enforce_case_product_packaging
before insert or update on public.products
for each row execute function public.enforce_case_product_packaging();

create function public.enforce_case_base_quantity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products%rowtype;
  v_row jsonb := to_jsonb(new);
  v_quantity numeric;
  v_secondary numeric;
  v_org_id uuid := (v_row->>'organization_id')::uuid;
  v_product_id uuid := (v_row->>'product_id')::uuid;
  v_stock_field text;
begin
  if tg_table_name = 'stock_movements' then
    select product_id into v_product_id from public.product_lots
      where id = new.lot_id and organization_id = v_org_id;
    if not found then raise exception 'Lote ajeno a la organización'; end if;
  elsif tg_table_name = 'pos_sale_items' then
    select organization_id into v_org_id from public.pos_sales where id = new.pos_sale_id;
  elsif tg_table_name = 'quote_items' then
    select organization_id into v_org_id from public.quotes where id = new.quote_id;
  end if;
  if v_product_id is null then return new; end if;
  select * into v_product from public.products
    where id = v_product_id and organization_id = v_org_id for share;
  if not found then raise exception 'Producto ajeno a la organización'; end if;
  if v_product.unit_of_measure::text <> 'CAJA' then return new; end if;
  if nullif(v_row->>'product_variant_id', '') is not null
    or v_row->'variant_stocks' not in ('null'::jsonb, '{}'::jsonb) then
    raise exception 'Los productos por caja no admiten variantes';
  end if;

  v_quantity := (v_row->>case when tg_table_name = 'product_lots'
    then 'quantity_available' else 'quantity' end)::numeric;
  if v_quantity is null or v_quantity < 0
    or v_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or trunc(v_quantity) <> v_quantity or v_quantity > 9007199254740991 then
    raise exception 'La cantidad por caja debe expresarse en unidades individuales enteras';
  end if;
  if tg_table_name = 'stock_movements' then
    foreach v_stock_field in array array['previous_stock', 'new_stock'] loop
      v_secondary := (v_row->>v_stock_field)::numeric;
      if v_secondary is null or v_secondary < 0
        or v_secondary::text in ('NaN', 'Infinity', '-Infinity')
        or trunc(v_secondary) <> v_secondary or v_secondary > 9007199254740991 then
        raise exception 'Los saldos del movimiento por caja deben ser unidades enteras';
      end if;
    end loop;
  end if;
  v_secondary := coalesce((v_row->>'unit_quantity')::numeric, 0);
  if tg_table_name = 'product_lots' then
    v_secondary := coalesce((v_row->>'unit_quantity_available')::numeric, 0);
  end if;
  if v_secondary::text in ('NaN', 'Infinity', '-Infinity')
    or (tg_table_name in ('purchase_order_items', 'purchase_receipt_items')
      and v_secondary not in (0, v_quantity))
    or (tg_table_name not in ('purchase_order_items', 'purchase_receipt_items')
      and v_secondary <> 0) then
    raise exception 'Los productos por caja no registran peso ni piezas por separado';
  end if;
  if tg_table_name in ('purchase_order_items', 'purchase_receipt_items') then
    new.unit_quantity := v_quantity;
  end if;
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'product_lots', 'stock_movements', 'sales_order_items', 'purchase_order_items'
  ] loop
    execute format('create trigger enforce_case_base_quantity before insert or update on public.%I
      for each row execute function public.enforce_case_base_quantity()', v_table);
  end loop;
  foreach v_table in array array[
    'purchase_receipt_items', 'pos_sale_items', 'quote_items',
    'credit_note_items', 'sales_return_items', 'pos_sales_return_items'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then continue; end if;
    execute format('create trigger enforce_case_base_quantity before insert or update on public.%I
      for each row execute function public.enforce_case_base_quantity()', v_table);
  end loop;
end;
$$;

-- A direct price-list write must also serialize with packaging changes.
create function public.lock_case_price_presentation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.products
    where id = new.product_id and organization_id = (
      select organization_id from public.price_lists where id = new.price_list_id
    ) for share;
  if not found then raise exception 'Producto ajeno a la organización'; end if;
  return new;
end;
$$;
create trigger lock_case_price_presentation
before insert or update on public.price_list_items
for each row execute function public.lock_case_price_presentation();

-- Preserve sub-cent base prices. Line totals still use the app's existing
-- monetary convention; a proportional price must not be rounded to cents first.
alter table public.sales_order_items alter column unit_price type numeric,
  alter column base_price type numeric;
alter table public.purchase_order_items alter column unit_cost type numeric;
-- These modules may not be installed in every deployment. IF EXISTS skips only
-- missing relations; an incompatible column/schema still raises an error.
alter table if exists public.pos_sale_items alter column unit_price type numeric;
alter table if exists public.conversation_cart_items alter column unit_price type numeric;
alter table if exists public.quote_items alter column unit_price type numeric;
alter table if exists public.sales_return_items alter column unit_price type numeric;
alter table if exists public.credit_note_items alter column unit_price type numeric;
alter table if exists public.pos_sales_return_items alter column unit_price type numeric;

-- Restrictive policies supplement existing tenant policies; they grant no new
-- access. service_role operations retain their existing administrative boundary.
alter table public.organization_settings enable row level security;
create policy organization_settings_admin_insert on public.organization_settings
  as restrictive for insert to authenticated
  with check (public.user_can_admin_organization(organization_id));
create policy organization_settings_admin_update on public.organization_settings
  as restrictive for update to authenticated
  using (public.user_can_admin_organization(organization_id))
  with check (public.user_can_admin_organization(organization_id));
create policy organization_settings_admin_delete on public.organization_settings
  as restrictive for delete to authenticated
  using (public.user_can_admin_organization(organization_id));

revoke all on function public.enforce_case_product_packaging() from public, anon, authenticated;
revoke all on function public.enforce_case_base_quantity() from public, anon, authenticated;
revoke all on function public.lock_case_price_presentation() from public, anon, authenticated;

commit;
