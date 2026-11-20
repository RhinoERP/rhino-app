-- Apply AFTER 20261117000000. New work never alters the applied visit migrations.
-- Customer sites are business master data. Per-visit check-in GPS remains temporary.
create table public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  address text not null default '' check (length(address) <= 500),
  city text not null default '' check (length(city) <= 120),
  notes text check (length(notes) <= 1000),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_id, id),
  check ((latitude is null) = (longitude is null))
);
create index customer_sites_customer on public.customer_sites (organization_id, customer_id, active);
alter table public.customer_sites enable row level security;
revoke all on public.customer_sites from public, anon, authenticated;

do $$ begin
  if exists (select 1 from public.customers c where
    length(coalesce(nullif(btrim(c.delivery_address), ''), c.address, '')) > 500
    or length(coalesce(nullif(btrim(c.delivery_city), ''), c.city, '')) > 120) then
    raise exception 'Hay direcciones de clientes demasiado largas para migrar: revisar antes de continuar';
  end if;
end $$;

-- Preserve the old approved point and existing delivery address as one initial
-- site per customer; even customers with no address keep a site to classify visits.
insert into public.customer_sites (organization_id, customer_id, name, address, city, latitude, longitude)
select c.organization_id, c.id, 'Principal', coalesce(nullif(btrim(c.delivery_address), ''), c.address, ''),
  coalesce(nullif(btrim(c.delivery_city), ''), c.city, ''),
  case when l.approved_at is not null then l.latitude end,
  case when l.approved_at is not null then l.longitude end
from public.customers c left join public.commercial_customer_locations l
  on l.customer_id = c.id and l.organization_id = c.organization_id;

alter table public.commercial_visits add column site_id uuid;
alter table public.commercial_visits add column site_name_snapshot text;
alter table public.commercial_visits add column site_address_snapshot text;
update public.commercial_visits v set site_id = s.id,
  site_name_snapshot = s.name, site_address_snapshot = s.address
from public.customer_sites s where s.organization_id = v.organization_id and s.customer_id = v.customer_id
  and s.name = 'Principal';
alter table public.commercial_visits add constraint commercial_visits_site_customer_fkey
  foreign key (organization_id, customer_id, site_id)
  references public.customer_sites (organization_id, customer_id, id) on delete restrict;
drop index public.commercial_visits_route_customer;
create unique index commercial_visits_route_customer_site
  on public.commercial_visits (route_id, customer_id, site_id);

alter table public.commercial_location_proposals add column site_id uuid;
alter table public.commercial_location_proposals add column proposed_address text
  check (proposed_address is null or length(btrim(proposed_address)) between 1 and 500);
alter table public.commercial_location_proposals add column proposed_city text
  check (proposed_city is null or length(btrim(proposed_city)) between 1 and 120);
alter table public.commercial_location_proposals add constraint commercial_proposal_address_pair
  check ((proposed_address is null) = (proposed_city is null));
update public.commercial_location_proposals p set site_id = v.site_id
from public.commercial_visits v where v.id = p.visit_id;
alter table public.commercial_location_proposals add constraint commercial_proposals_site_customer_fkey
  foreign key (organization_id, customer_id, site_id)
  references public.customer_sites (organization_id, customer_id, id) on delete restrict;
drop index public.commercial_location_one_pending;
create unique index commercial_location_one_pending_site
  on public.commercial_location_proposals (site_id) where status = 'pending';

alter table public.sales_orders add column delivery_site_id uuid;
alter table public.sales_orders add column delivery_site_name text;
alter table public.sales_orders add column delivery_site_address text;
alter table public.sales_orders add column delivery_site_city text;
alter table public.sales_orders add constraint sales_orders_delivery_site_customer_fkey
  foreign key (organization_id, customer_id, delivery_site_id)
  references public.customer_sites (organization_id, customer_id, id) on delete restrict;

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
    'city', s.city, 'notes', s.notes, 'active', s.active,
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

create or replace function public.commercial_site_save(
  p_org uuid, p_customer uuid, p_site uuid, p_name text, p_address text, p_city text,
  p_notes text, p_active boolean, p_lat double precision, p_lng double precision)
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
    or length(coalesce(p_notes, '')) > 1000 or p_active is null
    or (p_lat is null) <> (p_lng is null)
    or (p_lat is not null and (not (p_lat between -90 and 90) or not (p_lng between -180 and 180))) then
    raise exception 'Datos de sucursal inválidos' using errcode = '22023';
  end if;
  if p_site is null then
    insert into public.customer_sites (organization_id, customer_id, name, address, city, notes, active,
      latitude, longitude)
      values (p_org, p_customer, btrim(p_name), btrim(p_address), btrim(p_city),
        nullif(btrim(p_notes), ''), p_active, p_lat, p_lng) returning id into v_id;
  else
    -- Admin edits are explicit; seller coordinate changes require a proposal.
    update public.customer_sites set name = btrim(p_name), address = btrim(p_address),
      city = btrim(p_city), notes = nullif(btrim(p_notes), ''), active = p_active,
      latitude = p_lat, longitude = p_lng,
      updated_at = now()
      where id = p_site and customer_id = p_customer and organization_id = p_org returning id into v_id;
    if v_id is null then raise exception 'Sucursal no encontrada' using errcode = '22023'; end if;
  end if;
  return v_id;
end $$;

-- The chosen site is immutable after arrival; a historic visit stays on its
-- original site even if the master address is edited or deactivated later.
create or replace function public.commercial_route_add_site_visit(
  p_org uuid, p_route uuid, p_customer uuid, p_site uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_route public.commercial_routes%rowtype; v_id uuid; v_position integer;
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org)
    or public.user_has_org_permission('sales.manage.all', p_org)
    or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para visitas comerciales' using errcode = '42501';
  end if;
  select * into v_route from public.commercial_routes where id = p_route and organization_id = p_org
    and seller_id = auth.uid() for update;
  if not found or v_route.status <> 'open'
    or v_route.route_date < current_date - 1 or v_route.route_date > current_date + 7 then
    raise exception 'Ruta no disponible' using errcode = '22023';
  end if;
  if not exists (select 1 from public.customer_sites s join public.customers c on c.id = s.customer_id
      where s.id = p_site and s.organization_id = p_org and s.customer_id = p_customer
        and s.active and c.is_active and c.organization_id = p_org
        and (c.assigned_seller_id is null or c.assigned_seller_id = auth.uid())) then
    raise exception 'La sucursal no corresponde al cliente o no está disponible' using errcode = '42501';
  end if;
  select id into v_id from public.commercial_visits
    where route_id = p_route and customer_id = p_customer and site_id = p_site;
  if v_id is not null then return v_id; end if;
  select coalesce(max(planned_position), 0) + 1 into v_position
    from public.commercial_visits where route_id = p_route;
  insert into public.commercial_visits
    (organization_id, seller_id, customer_id, visit_date, route_id, planned_position, site_id,
      site_name_snapshot, site_address_snapshot)
    select p_org, auth.uid(), p_customer, v_route.route_date, p_route, v_position, p_site,
      s.name, s.address from public.customer_sites s where s.id = p_site
    returning id into v_id;
  return v_id;
end $$;
-- The old add RPC must not create site-less visits or reuse the wrong branch.
revoke all on function public.commercial_route_add_visit(uuid,uuid,uuid),
  public.commercial_visit_add(uuid,uuid,date) from public, anon, authenticated;

-- Expose the branch alongside each visit and customer without changing the
-- previous route RPC or its security checks. Reuse that RPC for existing data.
create or replace function public.commercial_site_route_day(p_org uuid, p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_base jsonb; v_routes jsonb; v_customers jsonb;
begin
  v_base := public.commercial_route_day(p_org, p_day);
  select coalesce(jsonb_agg(r.route_data order by r.ordinal), '[]'::jsonb) into v_routes
  from (select route, ordinal,
      route || jsonb_build_object('visits', coalesce((select jsonb_agg(
        visit || jsonb_build_object('siteId', s.id,
          'siteName', coalesce(v.site_name_snapshot, s.name),
          'siteAddress', coalesce(v.site_address_snapshot, s.address),
          'hasLocation', s.latitude is not null,
          'hasPendingLocation', exists (select 1 from public.commercial_location_proposals p
            where p.site_id = s.id and p.status = 'pending')) order by position)
        from jsonb_array_elements(route->'visits') with ordinality as visits(visit, position)
        left join public.commercial_visits v on v.id = (visit->>'id')::uuid
        left join public.customer_sites s on s.id = v.site_id), '[]'::jsonb)) as route_data
    from jsonb_array_elements(v_base->'routes') with ordinality as routes(route, ordinal)) r;
  select coalesce(jsonb_agg(c.customer_data order by c.ordinal), '[]'::jsonb) into v_customers
  from (select customer, ordinal,
      customer || jsonb_build_object('sites', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'address', s.address, 'city', s.city)
        order by s.created_at, s.id) from public.customer_sites s
        where s.organization_id = p_org and s.customer_id = (customer->>'id')::uuid
          and s.active), '[]'::jsonb)) as customer_data
    from jsonb_array_elements(v_base->'customers') with ordinality as customers(customer, ordinal)) c;
  return jsonb_build_object('routes', v_routes, 'customers', v_customers);
end $$;

create or replace function public.commercial_site_location_propose(
  p_org uuid, p_visit uuid, p_lat double precision, p_lng double precision,
  p_accuracy double precision, p_method text, p_address text, p_city text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_visit public.commercial_visits%rowtype; v_id uuid;
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org)
    or public.user_has_org_permission('sales.manage.all', p_org)
    or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para proponer ubicaciones' using errcode = '42501';
  end if;
  select * into v_visit from public.commercial_visits
    where id = p_visit and organization_id = p_org and seller_id = auth.uid() for update;
  if not found or v_visit.checked_in_at is null or v_visit.site_id is null
    or p_method is null or p_method not in ('gps','pin') or p_lat is null or p_lng is null
    or not (p_lat between -90 and 90) or not (p_lng between -180 and 180)
    or (p_method = 'gps' and (p_accuracy is null or not (p_accuracy between 0 and 1000)))
    or (p_method = 'pin' and p_accuracy is not null)
    or (p_address is null) <> (p_city is null)
    or (p_address is not null and (length(btrim(p_address)) not between 1 and 500
      or length(btrim(p_city)) not between 1 and 120)) then
    raise exception 'Punto o visita inválida' using errcode = '22023';
  end if;
  insert into public.commercial_location_proposals
    (organization_id, customer_id, visit_id, site_id, latitude, longitude, accuracy_m, method,
      proposed_address, proposed_city, proposed_by)
    values (p_org, v_visit.customer_id, p_visit, v_visit.site_id, p_lat, p_lng,
      p_accuracy, p_method, nullif(btrim(p_address), ''), nullif(btrim(p_city), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.commercial_site_location_decide(
  p_org uuid, p_proposal uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_proposal public.commercial_location_proposals%rowtype;
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso para aprobar puntos' using errcode = '42501';
  end if;
  select * into v_proposal from public.commercial_location_proposals
    where id = p_proposal and organization_id = p_org and status = 'pending' for update;
  if not found or v_proposal.site_id is null or p_approve is null
    or (not p_approve and (p_reason is null or length(btrim(p_reason)) not between 1 and 1000)) then
    raise exception 'Propuesta no disponible o motivo inválido' using errcode = '22023';
  end if;
  if p_approve then
    update public.customer_sites set latitude = v_proposal.latitude,
      longitude = v_proposal.longitude,
      address = coalesce(v_proposal.proposed_address, address),
      city = coalesce(v_proposal.proposed_city, city), updated_at = now()
      where id = v_proposal.site_id and organization_id = p_org
        and customer_id = v_proposal.customer_id;
  end if;
  update public.commercial_location_proposals set
    status = case when p_approve then 'approved' else 'rejected' end,
    latitude = case when p_approve then latitude end,
    longitude = case when p_approve then longitude end,
    accuracy_m = case when p_approve then accuracy_m end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_reason = nullif(btrim(p_reason), '')
    where id = p_proposal;
end $$;
revoke all on function public.commercial_location_propose(uuid,uuid,double precision,double precision,double precision,text),
  public.commercial_location_decide(uuid,uuid,boolean,text) from public, anon, authenticated;

create or replace function public.commercial_site_review_queue(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_base jsonb;
begin
  v_base := public.commercial_visit_review_queue(p_org);
  return v_base || jsonb_build_object(
    'locations', coalesce((select jsonb_agg(jsonb_build_object(
      'proposalId', p.id, 'visitId', p.visit_id, 'customerId', p.customer_id,
      'customerName', coalesce(c.fantasy_name, c.business_name), 'siteName', s.name,
      'latitude', p.latitude, 'longitude', p.longitude, 'accuracyM', p.accuracy_m,
      'address', p.proposed_address, 'city', p.proposed_city, 'method', p.method) order by p.proposed_at)
      from public.commercial_location_proposals p
      join public.customers c on c.id = p.customer_id
      join public.customer_sites s on s.id = p.site_id
      where p.organization_id = p_org and p.status = 'pending'), '[]'::jsonb),
    'dayOverview', coalesce((select jsonb_agg(overview || jsonb_build_object(
      'siteName', coalesce(v.site_name_snapshot, s.name), 'latitude', s.latitude, 'longitude', s.longitude) order by position)
      from jsonb_array_elements(v_base->'dayOverview') with ordinality as rows(overview, position)
      left join public.commercial_visits v on v.id = (overview->>'id')::uuid
      left join public.customer_sites s on s.id = v.site_id), '[]'::jsonb),
    'visits', coalesce((select jsonb_agg(visit || jsonb_build_object(
      'siteName', coalesce(v.site_name_snapshot, s.name), 'distanceM', null)
      order by position) from jsonb_array_elements(v_base->'visits') with ordinality as rows(visit, position)
      left join public.commercial_visits v on v.id = (visit->>'id')::uuid
      left join public.customer_sites s on s.id = v.site_id), '[]'::jsonb));
end $$;

create or replace function public.commercial_site_admin_day(p_org uuid, p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_base jsonb;
begin
  v_base := public.commercial_visit_admin_day(p_org, p_day);
  return coalesce((select jsonb_agg(visit || jsonb_build_object('siteName', coalesce(v.site_name_snapshot, s.name))
    order by position) from jsonb_array_elements(v_base) with ordinality as rows(visit, position)
    left join public.commercial_visits v on v.id = (visit->>'id')::uuid
    left join public.customer_sites s on s.id = v.site_id), '[]'::jsonb);
end $$;

create or replace function public.commercial_site_document_history(p_org uuid, p_visit uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_base jsonb; v_site_name text;
begin
  v_base := public.commercial_visit_document_history(p_org, p_visit);
  select coalesce(v.site_name_snapshot, s.name) into v_site_name from public.commercial_visits v
    join public.customer_sites s on s.id = v.site_id
    where v.id = p_visit and v.organization_id = p_org;
  return jsonb_set(v_base, '{visit,siteName}', to_jsonb(v_site_name), true);
end $$;

-- Site and address are snapshotted on the sale when it joins distribution.
-- The legal customer, quote and pre-sale creation remain unchanged.
create or replace function public.commercial_site_assign_delivery(
  p_org uuid, p_sheet uuid, p_sale uuid, p_site uuid, p_remittance text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sheet public.route_sheets%rowtype; v_sale public.sales_orders%rowtype;
  v_site public.customer_sites%rowtype;
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org)
    or public.user_has_org_permission('sales.manage.all', p_org)
    or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para asignar entregas' using errcode = '42501';
  end if;
  select * into v_sheet from public.route_sheets where id = p_sheet
    and organization_id = p_org for update;
  select * into v_sale from public.sales_orders where id = p_sale
    and organization_id = p_org for update;
  if v_sheet.id is null or v_sheet.status not in ('PENDING','IN_PROGRESS')
    or v_sale.id is null or v_sale.status <> 'CONFIRMED'
    or (v_sale.route_sheet_id is not null and v_sale.route_sheet_id <> p_sheet)
    or (v_sale.user_id is distinct from auth.uid() and not (
      public.user_has_org_permission('sales.manage.all', p_org)
      or public.user_has_org_permission('organization.admin', p_org)))
    or p_remittance is null or length(btrim(p_remittance)) not between 1 and 50 then
    raise exception 'Venta u hoja de ruta no disponible' using errcode = '22023';
  end if;
  select * into v_site from public.customer_sites where id = p_site and organization_id = p_org
    and customer_id = v_sale.customer_id and active;
  if not found or length(btrim(v_site.address)) = 0 or length(btrim(v_site.city)) = 0 then
    raise exception 'Seleccioná una sucursal con dirección y ciudad completas' using errcode = '22023';
  end if;
  update public.sales_orders set route_sheet_id = p_sheet, remittance_number = btrim(p_remittance),
    delivery_site_id = v_site.id, delivery_site_name = v_site.name,
    delivery_site_address = v_site.address, delivery_site_city = v_site.city,
    updated_at = now() where id = p_sale;
end $$;

revoke all on function public.commercial_site_catalog(uuid,uuid),
  public.commercial_site_save(uuid,uuid,uuid,text,text,text,text,boolean,double precision,double precision),
  public.commercial_route_add_site_visit(uuid,uuid,uuid,uuid),
  public.commercial_site_location_propose(uuid,uuid,double precision,double precision,double precision,text,text,text),
  public.commercial_site_location_decide(uuid,uuid,boolean,text),
  public.commercial_site_route_day(uuid,date), public.commercial_site_review_queue(uuid),
  public.commercial_site_admin_day(uuid,date), public.commercial_site_document_history(uuid,uuid),
  public.commercial_site_assign_delivery(uuid,uuid,uuid,uuid,text) from public, anon;
grant execute on function public.commercial_site_catalog(uuid,uuid),
  public.commercial_site_save(uuid,uuid,uuid,text,text,text,text,boolean,double precision,double precision),
  public.commercial_route_add_site_visit(uuid,uuid,uuid,uuid),
  public.commercial_site_location_propose(uuid,uuid,double precision,double precision,double precision,text,text,text),
  public.commercial_site_location_decide(uuid,uuid,boolean,text),
  public.commercial_site_route_day(uuid,date), public.commercial_site_review_queue(uuid),
  public.commercial_site_admin_day(uuid,date), public.commercial_site_document_history(uuid,uuid),
  public.commercial_site_assign_delivery(uuid,uuid,uuid,uuid,text) to authenticated;
