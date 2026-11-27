-- Postal codes are optional; existing sites and approved coordinates remain intact.
alter table public.customer_sites
  add column postal_code text not null default ''
  check (length(postal_code) <= 16);

-- Preserve the existing catalog's seller scope; only include the new field.
create or replace function public.commercial_site_catalog(p_org uuid, p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org)
    or public.user_has_org_permission('sales.manage.all', p_org)
    or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para consultar sucursales' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', s.id, 'customerId', s.customer_id, 'name', s.name, 'address', s.address,
    'city', s.city, 'postalCode', s.postal_code, 'notes', s.notes, 'active', s.active,
    'latitude', s.latitude, 'longitude', s.longitude) order by s.customer_id, s.created_at, s.id)
    from public.customer_sites s where s.organization_id = p_org
      and (p_customer is null or s.customer_id = p_customer)
      and (public.user_has_org_permission('organization.admin', p_org)
        or public.user_has_org_permission('sales.manage.all', p_org)
        or (exists (select 1 from public.customers c where c.id = s.customer_id
          and c.organization_id = p_org and (c.assigned_seller_id is null or c.assigned_seller_id = auth.uid()))
          or exists (select 1 from public.sales_orders o where o.customer_id = s.customer_id
            and o.organization_id = p_org and o.user_id = auth.uid())))
      and (s.active or public.user_has_org_permission('organization.admin', p_org))), '[]'::jsonb);
end $$;

-- New RPC rather than changing the signature of the original one.
create function public.commercial_site_save_with_postcode(
  p_org uuid, p_customer uuid, p_site uuid, p_name text, p_address text, p_city text,
  p_postal_code text, p_notes text, p_active boolean, p_lat double precision, p_lng double precision)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Solo el administrador puede cargar sucursales' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customers where id = p_customer and organization_id = p_org)
    or p_name is null or length(btrim(p_name)) not between 1 and 120
    or p_address is null or length(btrim(p_address)) not between 1 and 500
    or p_city is null or length(btrim(p_city)) not between 1 and 120
    or length(coalesce(p_postal_code, '')) > 16
    or length(coalesce(p_notes, '')) > 1000 or p_active is null
    or (p_lat is null) <> (p_lng is null)
    or (p_lat is not null and (not (p_lat between -90 and 90) or not (p_lng between -180 and 180))) then
    raise exception 'Datos de sucursal inválidos' using errcode = '22023';
  end if;
  if p_site is null then
    insert into public.customer_sites (organization_id, customer_id, name, address, city,
      postal_code, notes, active, latitude, longitude)
      values (p_org, p_customer, btrim(p_name), btrim(p_address), btrim(p_city),
        btrim(coalesce(p_postal_code, '')), nullif(btrim(p_notes), ''), p_active, p_lat, p_lng)
      returning id into v_id;
  else
    update public.customer_sites set name = btrim(p_name), address = btrim(p_address),
      city = btrim(p_city), postal_code = btrim(coalesce(p_postal_code, '')),
      notes = nullif(btrim(p_notes), ''), active = p_active,
      latitude = p_lat, longitude = p_lng, updated_at = now()
      where id = p_site and customer_id = p_customer and organization_id = p_org returning id into v_id;
    if v_id is null then raise exception 'Sucursal no encontrada' using errcode = '22023'; end if;
  end if;
  return v_id;
end $$;

revoke all on function public.commercial_site_save_with_postcode(
  uuid,uuid,uuid,text,text,text,text,text,boolean,double precision,double precision) from public, anon;
grant execute on function public.commercial_site_save_with_postcode(
  uuid,uuid,uuid,text,text,text,text,text,boolean,double precision,double precision) to authenticated;
