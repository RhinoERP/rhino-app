begin;

-- lot_id is a compatibility link, not the identity of warehouse stock.
alter table public.product_variants alter column lot_id drop not null;

do $$
declare
  v_fk record;
  v_lot_column smallint;
begin
  select a.attnum into v_lot_column
  from pg_attribute a
  where a.attrelid = 'public.product_variants'::regclass
    and a.attname = 'lot_id' and not a.attisdropped;

  for v_fk in
    select c.conname, c.conkey
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.product_variants'::regclass
      and c.confrelid = 'public.product_lots'::regclass
      and v_lot_column = any(c.conkey)
  loop
    if v_fk.conkey <> array[v_lot_column]::smallint[] then
      raise exception 'La relación legacy lot_id tiene una FK compuesta no prevista: %', v_fk.conname;
    end if;
    execute format('alter table public.product_variants drop constraint %I', v_fk.conname);
  end loop;
end;
$$;

alter table public.product_variants
  add constraint product_variants_lot_id_fkey
  foreign key (lot_id) references public.product_lots(id) on delete set null;

-- Bounded definer helper: permissions/reference/warehouse metadata only.
-- It never inserts products or stock and never accepts a different user ID.
create function public.resolve_product_creation_context(
  p_org_id uuid,
  p_has_variants boolean,
  p_supplier_id uuid default null,
  p_category_id uuid default null,
  p_tax_ids uuid[] default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.organization_members%rowtype;
  v_warehouse public.warehouses%rowtype;
  v_is_admin boolean;
  v_tax_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Usuario no autenticado';
  end if;
  select * into v_member from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = (select auth.uid()) and m.is_active
    for share;
  if not found then
    raise exception using errcode = '42501', message = 'Sin acceso a la organización';
  end if;
  v_is_admin := coalesce(v_member.is_owner, false) or exists (
    select 1 from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions permission on permission.id = rp.permission_id
    where r.id = v_member.role_id and r.organization_id = p_org_id
      and permission.key = 'organization.admin'
  );
  if not v_is_admin and not exists (
    select 1 from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions permission on permission.id = rp.permission_id
    where r.id = v_member.role_id and r.organization_id = p_org_id
      and permission.key = 'inventory.manage'
  ) then
    raise exception using errcode = '42501', message = 'Sin permiso para crear productos';
  end if;
  if p_supplier_id is not null then
    perform 1 from public.suppliers s
      where s.id = p_supplier_id and s.organization_id = p_org_id for share;
    if not found then
      raise exception using errcode = '22023', message = 'El proveedor no existe en esta organización';
    end if;
  end if;
  if p_category_id is not null then
    perform 1 from public.categories c
      where c.id = p_category_id and c.organization_id = p_org_id for share;
    if not found then
      raise exception using errcode = '22023', message = 'La categoría no existe en esta organización';
    end if;
  end if;
  perform t.id from public.taxes t
    where t.organization_id = p_org_id and t.id = any(p_tax_ids) and t.is_active
    for share;
  get diagnostics v_tax_count = row_count;
  if v_tax_count <> coalesce(cardinality(p_tax_ids), 0) then
    raise exception using errcode = '22023', message = 'Algún impuesto no está habilitado en esta organización';
  end if;

  if not coalesce(p_has_variants, false) then
    return null;
  end if;

  select * into v_warehouse from public.warehouses w
    where w.organization_id = p_org_id and w.is_default
    for share;
  if not found or not v_warehouse.is_active then
    raise exception using errcode = '42501', message = 'El depósito principal no está habilitado para crear los saldos iniciales';
  end if;
  if not v_is_admin then
    perform 1 from public.warehouse_user_assignments a
      where a.organization_id = p_org_id and a.warehouse_id = v_warehouse.id
        and a.user_id = (select auth.uid())
      for share;
    if not found then
      raise exception using errcode = '42501', message = 'El depósito principal no está asignado a tu usuario';
    end if;
  end if;
  return v_warehouse.id;
end;
$$;

revoke all on function public.resolve_product_creation_context(uuid, boolean, uuid, uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_product_creation_context(uuid, boolean, uuid, uuid, uuid[])
  to authenticated, service_role;

-- One RPC/transaction per product. RLS and database constraints still apply to
-- every write; errors are deliberately not swallowed or converted into success.
create function public.create_inventory_product(
  p_org_id uuid,
  p_product jsonb,
  p_variants jsonb default '[]'::jsonb,
  p_tax_ids uuid[] default null
)
returns setof public.products
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_product public.products%rowtype;
  v_data jsonb;
  v_columns text;
  v_key text;
  v_has_variants boolean;
  v_warehouse_id uuid;
  v_supplier_id uuid;
  v_category_id uuid;
  v_tax_ids uuid[];
begin
  if p_product is null or jsonb_typeof(p_product) <> 'object' then
    raise exception using errcode = '22023', message = 'Los datos del producto son inválidos';
  end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array' then
    raise exception using errcode = '22023', message = 'La lista de variantes es inválida';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_product) as k(key)
    where not (k.key = any(array[
      'name', 'sku', 'barcode', 'description', 'brand', 'accounting_account_code',
      'profit_margin', 'min_stock', 'sale_price', 'category_id', 'supplier_id',
      'unit_of_measure', 'units_per_box', 'boxes_per_pallet', 'weight_per_unit',
      'image_url', 'tracks_stock_units', 'has_variants'
    ]::text[]))
  ) then
    raise exception using errcode = '22023', message = 'El producto contiene campos no permitidos';
  end if;

  foreach v_key in array array['has_variants', 'tracks_stock_units'] loop
    if p_product ? v_key and jsonb_typeof(p_product -> v_key) not in ('boolean', 'null') then
      raise exception using errcode = '22023', message = 'La configuración de variantes o piezas es inválida';
    end if;
  end loop;
  v_has_variants := coalesce((p_product ->> 'has_variants')::boolean, false);

  foreach v_key in array array[
    'name', 'sku', 'barcode', 'description', 'brand', 'accounting_account_code',
    'category_id', 'supplier_id', 'unit_of_measure', 'image_url'
  ] loop
    if p_product ? v_key and jsonb_typeof(p_product -> v_key) not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'Un campo de texto del producto es inválido';
    end if;
  end loop;
  if coalesce(btrim(p_product ->> 'name'), '') = '' or coalesce(btrim(p_product ->> 'sku'), '') = '' then
    raise exception using errcode = '22023', message = 'El nombre y SKU del producto son obligatorios';
  end if;
  if coalesce(p_product ->> 'unit_of_measure', '') not in ('UN', 'KG', 'LT', 'MT') then
    raise exception using errcode = '22023', message = 'La unidad de medida es inválida';
  end if;
  foreach v_key in array array[
    'profit_margin', 'min_stock', 'sale_price', 'units_per_box', 'boxes_per_pallet', 'weight_per_unit'
  ] loop
    if p_product ? v_key and jsonb_typeof(p_product -> v_key) not in ('number', 'null') then
      raise exception using errcode = '22023', message = 'Un campo numérico del producto es inválido';
    end if;
  end loop;
  if (p_product ->> 'profit_margin')::numeric < 0 then
    raise exception using errcode = '22023', message = 'El margen debe ser mayor o igual a 0';
  end if;
  if jsonb_array_length(p_variants) > 1000 then
    raise exception using errcode = '22023', message = 'El producto admite hasta 1000 combinaciones de variantes';
  end if;
  if v_has_variants <> (jsonb_array_length(p_variants) > 0) then
    raise exception using errcode = '22023', message = 'La configuración del producto no coincide con sus variantes';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_variants) v(value)
    where jsonb_typeof(v.value) <> 'object'
      or jsonb_typeof(v.value -> 'talle') is distinct from 'string'
      or jsonb_typeof(v.value -> 'color') is distinct from 'string'
      or length(btrim(v.value ->> 'talle')) not between 1 and 50
      or length(btrim(v.value ->> 'color')) not between 1 and 50
  ) then
    raise exception using errcode = '22023', message = 'Cada variante requiere talle y color de hasta 50 caracteres';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_variants) v(value)
    cross join lateral jsonb_object_keys(v.value) k(key)
    where k.key not in ('talle', 'color')
  ) then
    raise exception using errcode = '22023', message = 'La variante contiene campos no permitidos';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_variants) v(value)
    group by btrim(v.value ->> 'talle'), btrim(v.value ->> 'color')
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'No se pueden repetir combinaciones de talle y color';
  end if;

  v_supplier_id := nullif(p_product ->> 'supplier_id', '')::uuid;
  v_category_id := nullif(p_product ->> 'category_id', '')::uuid;
  v_tax_ids := array(select distinct t.id from unnest(p_tax_ids) t(id) where t.id is not null);
  v_warehouse_id := public.resolve_product_creation_context(
    p_org_id, v_has_variants, v_supplier_id, v_category_id, v_tax_ids
  );

  v_data := jsonb_build_object(
    'organization_id', p_org_id,
    'name', btrim(p_product ->> 'name'),
    'sku', btrim(p_product ->> 'sku'),
    'barcode', coalesce(nullif(btrim(p_product ->> 'barcode'), ''), btrim(p_product ->> 'sku')),
    'description', nullif(btrim(p_product ->> 'description'), ''),
    'brand', nullif(btrim(p_product ->> 'brand'), ''),
    'accounting_account_code', nullif(btrim(p_product ->> 'accounting_account_code'), ''),
    'profit_margin', p_product -> 'profit_margin',
    'min_stock', p_product -> 'min_stock',
    'supplier_id', v_supplier_id,
    'category_id', v_category_id,
    'unit_of_measure', p_product ->> 'unit_of_measure',
    'units_per_box', nullif((p_product ->> 'units_per_box')::numeric, 0),
    'boxes_per_pallet', nullif((p_product ->> 'boxes_per_pallet')::numeric, 0),
    'weight_per_unit', nullif((p_product ->> 'weight_per_unit')::numeric, 0),
    'image_url', nullif(btrim(p_product ->> 'image_url'), ''),
    'tracks_stock_units', (p_product ->> 'unit_of_measure' in ('KG', 'LT'))
      and coalesce((p_product ->> 'tracks_stock_units')::boolean, false),
    'has_variants', v_has_variants,
    'is_active', true
  );
  v_columns := 'organization_id, name, sku, barcode, description, brand, accounting_account_code, profit_margin, min_stock, supplier_id, category_id, unit_of_measure, units_per_box, boxes_per_pallet, weight_per_unit, image_url, tracks_stock_units, has_variants, is_active';
  -- Omission preserves the existing DB default; the caller cannot choose column
  -- names. Values are bound as JSON, never interpolated into executable SQL.
  if jsonb_typeof(p_product -> 'sale_price') = 'number' then
    v_columns := v_columns || ', sale_price';
    v_data := v_data || jsonb_build_object('sale_price', p_product -> 'sale_price');
  end if;
  execute 'insert into public.products (' || v_columns || ') select ' || v_columns ||
    ' from jsonb_populate_record(null::public.products, $1) returning *'
    into v_product using v_data;

  if v_has_variants then
    with inserted as (
      insert into public.product_variants (organization_id, product_id, talle, color)
      select p_org_id, v_product.id, btrim(v.value ->> 'talle'), btrim(v.value ->> 'color')
      from jsonb_array_elements(p_variants) v(value)
      returning id
    )
    insert into public.product_lots (
      organization_id, product_id, warehouse_id, product_variant_id,
      lot_number, expiration_date, quantity_available, unit_quantity_available
    )
    select p_org_id, v_product.id, v_warehouse_id, i.id, 'DEFAULT', null, 0, 0
    from inserted i;
  end if;

  insert into public.product_tax_assignments (organization_id, product_id, tax_id)
  select p_org_id, v_product.id, t.id from unnest(v_tax_ids) t(id);

  return next v_product;
  return;
end;
$$;

revoke all on function public.create_inventory_product(uuid, jsonb, jsonb, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.create_inventory_product(uuid, jsonb, jsonb, uuid[])
  to authenticated, service_role;

commit;
