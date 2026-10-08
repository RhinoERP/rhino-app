create or replace function public.get_offline_pre_sale_replay_result(
  p_command jsonb
)
returns table (sales_order_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_command_id uuid;
  v_owner_user_id uuid;
  v_payload_hash text;
  v_existing public.offline_sale_commands%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'OFFLINE_AUTH_REQUIRED';
  end if;

  begin
    v_org_id := (p_command->>'organizationId')::uuid;
    v_command_id := (p_command->>'commandId')::uuid;
    v_owner_user_id := (p_command->>'ownerUserId')::uuid;
    v_payload_hash := encode(digest(p_command::text, 'sha256'), 'hex');
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'OFFLINE_VALIDATION_ERROR';
  end;

  if v_owner_user_id <> v_user_id then
    raise exception using errcode = 'P0001', message = 'OFFLINE_FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_org_id
      and om.user_id = v_user_id
      and om.is_active = true
      and om.disabled_at is null
  ) or (
    not public.user_has_org_permission('sales.manage', v_org_id)
    and not public.user_has_org_permission('sales.manage.all', v_org_id)
    and not public.user_has_org_permission('organization.admin', v_org_id)
  ) then
    raise exception using errcode = 'P0001', message = 'OFFLINE_FORBIDDEN';
  end if;

  select * into v_existing
  from public.offline_sale_commands osc
  where osc.organization_id = v_org_id
    and osc.command_id = v_command_id;

  if not found then
    return;
  end if;
  if v_existing.submitted_by <> v_user_id then
    raise exception using errcode = 'P0001', message = 'OFFLINE_FORBIDDEN';
  end if;
  if v_existing.payload_hash <> v_payload_hash then
    raise exception using errcode = 'P0001', message = 'OFFLINE_IDEMPOTENCY_CONFLICT';
  end if;
  if v_existing.sales_order_id is null or v_existing.completed_at is null then
    raise exception using errcode = 'P0001', message = 'OFFLINE_RETRYABLE';
  end if;

  return query select v_existing.sales_order_id;
end;
$$;

revoke all on function public.get_offline_pre_sale_replay_result(jsonb) from public;
grant execute on function public.get_offline_pre_sale_replay_result(jsonb) to authenticated;

create or replace function public.create_offline_pre_sale_atomic(
  p_actor_user_id uuid,
  p_command jsonb
)
returns table (sales_order_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := p_actor_user_id;
  v_org_id uuid;
  v_command_id uuid;
  v_snapshot_id uuid;
  v_customer_id uuid;
  v_seller_id uuid;
  v_owner_user_id uuid;
  v_sale_id uuid;
  v_payload_hash text;
  v_existing public.offline_sale_commands%rowtype;
  v_settings jsonb;
  v_subtotal numeric := 0;
  v_total_tax numeric := 0;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'OFFLINE_AUTH_REQUIRED';
  end if;

  begin
    if coalesce(p_command->>'type', '') <> 'preSale.create'
       or coalesce((p_command->>'schemaVersion')::integer, 0) <> 1 then
      raise exception using errcode = 'P0001', message = 'OFFLINE_VALIDATION_ERROR';
    end if;
    v_org_id := (p_command->>'organizationId')::uuid;
    v_command_id := (p_command->>'commandId')::uuid;
    v_snapshot_id := (p_command->>'snapshotId')::uuid;
    v_customer_id := (p_command#>>'{payload,customerId}')::uuid;
    v_seller_id := (p_command#>>'{payload,sellerId}')::uuid;
    v_owner_user_id := (p_command->>'ownerUserId')::uuid;
    v_payload_hash := encode(digest(p_command::text, 'sha256'), 'hex');
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'OFFLINE_VALIDATION_ERROR';
  end;

  if v_owner_user_id <> v_user_id then
    raise exception using errcode = 'P0001', message = 'OFFLINE_FORBIDDEN';
  end if;

  select * into v_existing
  from public.offline_sale_commands osc
  where osc.organization_id = v_org_id
    and osc.command_id = v_command_id;
  if found then
    if v_existing.submitted_by <> v_user_id then
      raise exception using errcode = 'P0001', message = 'OFFLINE_FORBIDDEN';
    end if;
    if v_existing.payload_hash <> v_payload_hash then
      raise exception using errcode = 'P0001', message = 'OFFLINE_IDEMPOTENCY_CONFLICT';
    end if;
    if v_existing.sales_order_id is null or v_existing.completed_at is null then
      raise exception using errcode = 'P0001', message = 'OFFLINE_RETRYABLE';
    end if;
    return query select v_existing.sales_order_id, true;
    return;
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_org_id and om.user_id = v_user_id
      and om.is_active = true and om.disabled_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'OFFLINE_FORBIDDEN';
  end if;

  select os.settings into v_settings
  from public.organizations o
  join public.organization_settings os on os.organization_id = o.id
  where o.id = v_org_id and o.is_active = true
    and o.wholesale_enabled is distinct from false
    and o.production_enabled is distinct from true
    and coalesce((os.settings->>'seller_offline_snapshot_enabled')::boolean, false);
  if not found then
    raise exception using errcode = 'P0001', message = 'OFFLINE_FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.customers c
    where c.id = v_customer_id and c.organization_id = v_org_id and c.is_active = true
  ) or not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_org_id and om.user_id = v_seller_id
      and om.is_active = true and om.disabled_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'OFFLINE_STALE_REFERENCE';
  end if;

  if coalesce(jsonb_typeof(v_settings->'sales_enabled_payment_methods'), '') <> 'array'
     or (
       jsonb_array_length(v_settings->'sales_enabled_payment_methods') > 0
       and not (v_settings->'sales_enabled_payment_methods' ? (p_command#>>'{payload,paymentMethod}'))
     ) then
    raise exception using errcode = 'P0001', message = 'OFFLINE_REVIEW_REQUIRED';
  end if;

  if coalesce(jsonb_typeof(p_command#>'{payload,items}'), '') <> 'array'
     or jsonb_array_length(p_command#>'{payload,items}') = 0
     or jsonb_array_length(p_command#>'{payload,items}') > 500
     or length(coalesce(p_command#>>'{payload,observations}', '')) > 1000 then
    raise exception using errcode = 'P0001', message = 'OFFLINE_VALIDATION_ERROR';
  end if;

  begin
    if exists (
      select 1 from jsonb_array_elements(p_command#>'{payload,items}') item
      where jsonb_typeof(item) <> 'object'
        or nullif(item->>'lineId', '') is null
        or (item->>'lineId')::uuid is null
        or nullif(item->>'productId', '') is null
        or (item->>'productId')::uuid is null
        or nullif(item->>'quantity', '') is null
        or nullif(item->>'unitPrice', '') is null
        or (item->>'quantity')::numeric <= 0 or (item->>'unitPrice')::numeric < 0
        or case
          when jsonb_typeof(coalesce(item->'taxes', '[]'::jsonb)) = 'array'
            then jsonb_array_length(coalesce(item->'taxes', '[]'::jsonb)) > 20
          else true
        end
    ) or exists (
      select 1 from jsonb_array_elements(p_command#>'{payload,items}') item
      group by item->>'lineId' having count(*) > 1
    ) then
      raise exception using errcode = 'P0001', message = 'OFFLINE_VALIDATION_ERROR';
    end if;
  exception
    when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
      raise exception using errcode = 'P0001', message = 'OFFLINE_VALIDATION_ERROR';
  end;

  begin
    if exists (
      select 1 from jsonb_array_elements(p_command#>'{payload,items}') item
      left join public.products p on p.id = (item->>'productId')::uuid
        and p.organization_id = v_org_id and p.is_active = true
      where p.id is null
    ) then
      raise exception using errcode = 'P0001', message = 'OFFLINE_STALE_REFERENCE';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_command#>'{payload,items}') item
      cross join jsonb_array_elements(coalesce(item->'taxes', '[]'::jsonb)) item_tax
      left join public.taxes t on t.id = (item_tax->>'taxId')::uuid
        and t.organization_id = v_org_id and t.is_active = true
        and t.name = item_tax->>'name' and t.rate = (item_tax->>'rate')::numeric
        and coalesce(t.code, '') = coalesce(item_tax->>'code', '')
      where t.id is null
    ) then
      raise exception using errcode = 'P0001', message = 'OFFLINE_REVIEW_REQUIRED';
    end if;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'OFFLINE_VALIDATION_ERROR';
  end;

  insert into public.offline_sale_commands (
    organization_id, command_id, command_type, schema_version, payload_hash,
    snapshot_id, submitted_by
  ) values (v_org_id, v_command_id, 'preSale.create', 1, v_payload_hash,
    v_snapshot_id, v_user_id)
  on conflict (organization_id, command_id) do nothing;

  if not found then
    select * into v_existing from public.offline_sale_commands osc
    where osc.organization_id = v_org_id and osc.command_id = v_command_id
    for update;
    if v_existing.submitted_by <> v_user_id then
      raise exception using errcode = 'P0001', message = 'OFFLINE_FORBIDDEN';
    end if;
    if v_existing.payload_hash <> v_payload_hash then
      raise exception using errcode = 'P0001', message = 'OFFLINE_IDEMPOTENCY_CONFLICT';
    end if;
    if v_existing.sales_order_id is null or v_existing.completed_at is null then
      raise exception using errcode = 'P0001', message = 'OFFLINE_RETRYABLE';
    end if;
    return query select v_existing.sales_order_id, true;
    return;
  end if;

  select coalesce(sum(trunc((item->>'quantity')::numeric * (item->>'unitPrice')::numeric, 2)), 0)
  into v_subtotal from jsonb_array_elements(p_command#>'{payload,items}') item;

  begin
    insert into public.sales_orders (
      organization_id, customer_id, user_id, sale_date, invoice_type, observations,
      sub_total, total_tax_amount, global_discount_percentage, global_discount_amount,
      total_amount, status, created_by
    ) values (
      v_org_id, v_customer_id, v_seller_id, (p_command#>>'{payload,saleDate}')::date,
      (p_command#>>'{payload,invoiceType}')::public.invoice_type,
      concat('Medio de pago sugerido: ', p_command#>>'{payload,paymentMethod}',
        case when nullif(trim(p_command#>>'{payload,observations}'), '') is null then ''
          else E'\n' || trim(p_command#>>'{payload,observations}') end),
      v_subtotal, null, 0, 0, v_subtotal, 'DRAFT', v_user_id
    ) returning id into v_sale_id;
  exception
    when invalid_text_representation or datetime_field_overflow then
      raise exception using errcode = 'P0001', message = 'OFFLINE_VALIDATION_ERROR';
  end;

  insert into public.sales_order_items (
    id, organization_id, sales_order_id, product_id, quantity, unit_price,
    base_price, discount_percentage, discount_amount, subtotal
  ) select (item->>'lineId')::uuid, v_org_id, v_sale_id, (item->>'productId')::uuid,
    (item->>'quantity')::numeric, (item->>'unitPrice')::numeric,
    (item->>'unitPrice')::numeric, 0, 0,
    trunc((item->>'quantity')::numeric * (item->>'unitPrice')::numeric, 2)
  from jsonb_array_elements(p_command#>'{payload,items}') item;

  insert into public.sales_order_item_taxes (
    organization_id, sales_order_id, sales_order_item_id, product_id, tax_id,
    name, rate, base_amount, tax_amount, tax_code_snapshot, source
  ) select v_org_id, v_sale_id, (item->>'lineId')::uuid, (item->>'productId')::uuid,
    (item_tax->>'taxId')::uuid, item_tax->>'name', (item_tax->>'rate')::numeric,
    trunc((item->>'quantity')::numeric * (item->>'unitPrice')::numeric, 2),
    trunc(trunc((item->>'quantity')::numeric * (item->>'unitPrice')::numeric, 2)
      * (item_tax->>'rate')::numeric / 100, 2), item_tax->>'code', 'product'
  from jsonb_array_elements(p_command#>'{payload,items}') item
  cross join jsonb_array_elements(coalesce(item->'taxes', '[]'::jsonb)) item_tax;

  insert into public.sales_order_taxes (
    organization_id, sales_order_id, tax_id, name, rate, base_amount,
    tax_amount, tax_code_snapshot
  ) select v_org_id, v_sale_id, soit.tax_id, soit.name, soit.rate,
    sum(soit.base_amount), sum(soit.tax_amount), soit.tax_code_snapshot
  from public.sales_order_item_taxes soit
  where soit.organization_id = v_org_id and soit.sales_order_id = v_sale_id
  group by soit.tax_id, soit.name, soit.rate, soit.tax_code_snapshot;

  select coalesce(sum(sot.tax_amount), 0) into v_total_tax
  from public.sales_order_taxes sot
  where sot.organization_id = v_org_id and sot.sales_order_id = v_sale_id;

  update public.sales_orders
  set total_tax_amount = case when v_total_tax = 0 then null else v_total_tax end,
      total_amount = trunc(v_subtotal + v_total_tax, 2)
  where id = v_sale_id and organization_id = v_org_id;

  update public.offline_sale_commands
  set sales_order_id = v_sale_id, completed_at = now()
  where organization_id = v_org_id and command_id = v_command_id;

  return query select v_sale_id, false;
end;
$$;

revoke all on function public.create_offline_pre_sale_atomic(jsonb)
  from public, anon, authenticated;
revoke all on function public.create_offline_pre_sale_atomic(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_offline_pre_sale_atomic(uuid, jsonb)
  to service_role;
