-- Ensures every existing organization has a "Consumidor Final" customer and
-- sets it as the default POS customer, so POS accounting never lacks one.

do $$
declare
  v_org record;
  v_customer_id uuid;
begin
  for v_org in select id from public.organizations loop
    select id into v_customer_id
    from public.customers
    where organization_id = v_org.id
      and lower(business_name) = 'consumidor final'
    limit 1;

    if v_customer_id is null then
      insert into public.customers (organization_id, business_name, tax_condition, is_active)
      values (v_org.id, 'Consumidor Final', 'CONSUMIDOR_FINAL', true)
      returning id into v_customer_id;
    end if;

    insert into public.organization_settings (organization_id, settings)
    values (v_org.id, jsonb_build_object('pos_default_customer_id', v_customer_id))
    on conflict (organization_id) do update
      set settings = organization_settings.settings || jsonb_build_object('pos_default_customer_id', v_customer_id)
      where organization_settings.settings->>'pos_default_customer_id' is null;
  end loop;
end $$;
