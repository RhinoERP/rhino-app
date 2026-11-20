-- Commercial visits are deliberately separate from delivery route_sheets.
-- Only the RPCs below can write precise locations; direct table access is revoked.
create table public.commercial_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  seller_id uuid not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  visit_date date not null,
  created_at timestamptz not null default now(),
  checked_in_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  checkin_method text check (checkin_method in ('gps', 'manual')),
  review_status text not null default 'not_visited' check (review_status in ('not_visited', 'pending', 'confirmed', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  unique (organization_id, seller_id, customer_id, visit_date),
  check ((checked_in_at is null and checkin_method is null and latitude is null and longitude is null)
    or (checked_in_at is not null and checkin_method is not null))
);

create index commercial_visits_seller_day on public.commercial_visits (organization_id, seller_id, visit_date);
create index commercial_visits_pending on public.commercial_visits (organization_id, review_status) where review_status = 'pending';

create table public.commercial_customer_locations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid primary key references public.customers(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  proposed_by_visit_id uuid references public.commercial_visits(id) on delete set null,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.commercial_visit_monthly_metrics (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  seller_id uuid not null,
  month date not null,
  visits integer not null default 0,
  confirmed integer not null default 0,
  manual integer not null default 0,
  primary key (organization_id, seller_id, month)
);

alter table public.commercial_visits enable row level security;
alter table public.commercial_customer_locations enable row level security;
alter table public.commercial_visit_monthly_metrics enable row level security;
revoke all on public.commercial_visits, public.commercial_customer_locations, public.commercial_visit_monthly_metrics from anon, authenticated;

create or replace function public.commercial_visit_day(p_org uuid, p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null or not (public.user_has_org_permission('sales.manage', p_org)
    or public.user_has_org_permission('sales.manage.all', p_org)
    or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para visitas comerciales' using errcode = '42501';
  end if;
  if p_day < current_date - 1 or p_day > current_date + 7 then
    raise exception 'Fecha fuera del rango permitido' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'visits', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'customerId', v.customer_id, 'customerName', coalesce(c.fantasy_name, c.business_name),
      'checkedInAt', v.checked_in_at, 'method', v.checkin_method, 'reviewStatus', v.review_status,
      'hasLocation', l.approved_at is not null) order by v.created_at)
      from public.commercial_visits v join public.customers c on c.id = v.customer_id
      left join public.commercial_customer_locations l on l.customer_id = c.id and l.organization_id = p_org
      where v.organization_id = p_org and v.seller_id = v_user and v.visit_date = p_day), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', coalesce(c.fantasy_name, c.business_name)) order by c.business_name)
      from public.customers c where c.organization_id = p_org and c.is_active = true
      and (c.assigned_seller_id is null or c.assigned_seller_id = v_user)), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.commercial_visit_add(p_org uuid, p_customer uuid, p_day date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not (public.user_has_org_permission('sales.manage', p_org)
    or public.user_has_org_permission('sales.manage.all', p_org)
    or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para visitas comerciales' using errcode = '42501';
  end if;
  -- Allow a one-day timezone boundary between the user's local day and DB UTC.
  if p_day < current_date - 1 or p_day > current_date + 7 then
    raise exception 'Fecha fuera del rango permitido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.customers where id = p_customer and organization_id = p_org
    and is_active = true and (assigned_seller_id is null or assigned_seller_id = v_user)) then
    raise exception 'Cliente no disponible para este vendedor' using errcode = '42501';
  end if;
  insert into public.commercial_visits (organization_id, seller_id, customer_id, visit_date)
    values (p_org, v_user, p_customer, p_day)
    on conflict (organization_id, seller_id, customer_id, visit_date) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from public.commercial_visits
      where organization_id = p_org and seller_id = v_user and customer_id = p_customer and visit_date = p_day;
  end if;
  return v_id;
end $$;

create or replace function public.commercial_visit_checkin(
  p_org uuid, p_visit uuid, p_lat double precision default null,
  p_lng double precision default null, p_accuracy double precision default null,
  p_manual boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_visit public.commercial_visits%rowtype;
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org)
    or public.user_has_org_permission('sales.manage.all', p_org)
    or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para visitas comerciales' using errcode = '42501';
  end if;
  select * into v_visit from public.commercial_visits
    where id = p_visit and organization_id = p_org and seller_id = auth.uid() for update;
  if not found or v_visit.visit_date < current_date - 1 or v_visit.visit_date > current_date then
    raise exception 'Visita no disponible' using errcode = '22023';
  end if;
  if v_visit.checked_in_at is not null then
    return; -- idempotent retry after lost response
  end if;
  if not p_manual and (p_lat is null or p_lng is null or p_accuracy is null
    or not (p_lat between -90 and 90) or not (p_lng between -180 and 180)
    or not (p_accuracy between 0 and 1000)) then
    raise exception 'Ubicación inválida' using errcode = '22023';
  end if;
  update public.commercial_visits set checked_in_at = now(),
    checkin_method = case when p_manual then 'manual' else 'gps' end,
    latitude = case when p_manual then null else p_lat end,
    longitude = case when p_manual then null else p_lng end,
    accuracy_m = case when p_manual then null else p_accuracy end,
    review_status = 'pending'
    where id = p_visit;
  -- First GPS reading proposes the customer point; it is NOT an approved geofence.
  if not p_manual and p_accuracy <= 100 then
    insert into public.commercial_customer_locations
      (organization_id, customer_id, latitude, longitude, proposed_by_visit_id)
      values (p_org, v_visit.customer_id, p_lat, p_lng, p_visit)
      on conflict (customer_id) do nothing;
  end if;
end $$;

revoke all on function public.commercial_visit_day(uuid, date), public.commercial_visit_add(uuid, uuid, date),
  public.commercial_visit_checkin(uuid, uuid, double precision, double precision, double precision, boolean) from public;
grant execute on function public.commercial_visit_day(uuid, date), public.commercial_visit_add(uuid, uuid, date),
  public.commercial_visit_checkin(uuid, uuid, double precision, double precision, double precision, boolean) to authenticated;

-- Location review is restricted to organization admins until supervisor-to-seller
-- assignments exist. Never expose precise seller locations to all sales readers.
create or replace function public.commercial_visit_review_queue(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso de supervisión' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'visits', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'sellerId', v.seller_id,
      'sellerName', coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, v.seller_id::text),
      'customerName', coalesce(c.fantasy_name, c.business_name),
      'checkedInAt', v.checked_in_at, 'method', v.checkin_method, 'latitude', v.latitude,
      'longitude', v.longitude, 'accuracyM', v.accuracy_m,
      'distanceM', case when l.approved_at is not null and v.latitude is not null then
        round((6371000 * 2 * asin(sqrt(
          power(sin(radians((v.latitude - l.latitude) / 2)), 2) +
          cos(radians(l.latitude)) * cos(radians(v.latitude)) *
          power(sin(radians((v.longitude - l.longitude) / 2)), 2)
        )))::numeric) end) order by v.checked_in_at desc)
      from public.commercial_visits v join public.customers c on c.id = v.customer_id
      left join auth.users u on u.id = v.seller_id
      left join public.commercial_customer_locations l on l.customer_id = v.customer_id and l.organization_id = p_org
      where v.organization_id = p_org and v.review_status = 'pending' and v.checked_in_at >= now() - interval '30 days'), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(jsonb_build_object(
      'customerId', l.customer_id, 'customerName', coalesce(c.fantasy_name, c.business_name),
      'latitude', l.latitude, 'longitude', l.longitude, 'accuracyM', v.accuracy_m) order by c.business_name)
      from public.commercial_customer_locations l join public.customers c on c.id = l.customer_id
      join public.commercial_visits v on v.id = l.proposed_by_visit_id
      where l.organization_id = p_org and l.approved_at is null and v.review_status = 'confirmed'), '[]'::jsonb),
    'dayOverview', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'sellerId', v.seller_id,
      'sellerName', coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, v.seller_id::text),
      'customerName', coalesce(c.fantasy_name, c.business_name),
      'visitDate', v.visit_date, 'checkedInAt', v.checked_in_at, 'reviewStatus', v.review_status,
      'latitude', case when l.approved_at is not null then l.latitude end,
      'longitude', case when l.approved_at is not null then l.longitude end)
      order by v.seller_id, v.created_at)
      from public.commercial_visits v join public.customers c on c.id = v.customer_id
      left join auth.users u on u.id = v.seller_id
      left join public.commercial_customer_locations l on l.customer_id = v.customer_id and l.organization_id = p_org
      where v.organization_id = p_org and v.visit_date between current_date - 1 and current_date), '[]'::jsonb),
    'monthlyMetrics', coalesce((select jsonb_agg(jsonb_build_object(
      'sellerId', m.seller_id, 'sellerName', coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, m.seller_id::text),
      'month', m.month, 'visits', m.visits, 'confirmed', m.confirmed, 'manual', m.manual)
      order by m.month desc, m.seller_id)
      from public.commercial_visit_monthly_metrics m left join auth.users u on u.id = m.seller_id
      where m.organization_id = p_org and m.month >= date_trunc('month', current_date - interval '24 months')::date), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.commercial_visit_review(p_org uuid, p_visit uuid, p_confirm boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso de supervisión' using errcode = '42501';
  end if;
  update public.commercial_visits set review_status = case when p_confirm then 'confirmed' else 'rejected' end,
    reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_visit and organization_id = p_org and review_status = 'pending';
  if not found then
    raise exception 'Visita pendiente no encontrada' using errcode = '22023';
  end if;
  if not p_confirm then
    delete from public.commercial_customer_locations
      where organization_id = p_org and proposed_by_visit_id = p_visit and approved_at is null;
  end if;
end $$;

create or replace function public.commercial_location_approve(p_org uuid, p_customer uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso de supervisión' using errcode = '42501';
  end if;
  update public.commercial_customer_locations set approved_at = now(), approved_by = auth.uid()
    where customer_id = p_customer and organization_id = p_org and approved_at is null
    and exists (select 1 from public.commercial_visits v where v.id = proposed_by_visit_id
      and v.organization_id = p_org and v.review_status = 'confirmed');
  if not found then
    raise exception 'Ubicación pendiente no encontrada' using errcode = '22023';
  end if;
end $$;

create or replace function public.commercial_location_reject(p_org uuid, p_customer uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso de supervisión' using errcode = '42501';
  end if;
  delete from public.commercial_customer_locations
    where customer_id = p_customer and organization_id = p_org and approved_at is null;
  if not found then
    raise exception 'Ubicación pendiente no encontrada' using errcode = '22023';
  end if;
end $$;

revoke all on function public.commercial_visit_review_queue(uuid), public.commercial_visit_review(uuid, uuid, boolean),
  public.commercial_location_approve(uuid, uuid), public.commercial_location_reject(uuid, uuid) from public;
grant execute on function public.commercial_visit_review_queue(uuid), public.commercial_visit_review(uuid, uuid, boolean),
  public.commercial_location_approve(uuid, uuid), public.commercial_location_reject(uuid, uuid) to authenticated;

-- Purge precise per-visit coordinates, and preserve only aggregated monthly KPIs.
-- Approved customer coordinates remain as business master data for future geofences.
create or replace function public.archive_commercial_visits()
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.commercial_visit_monthly_metrics (organization_id, seller_id, month, visits, confirmed, manual)
  select organization_id, seller_id, date_trunc('month', visit_date)::date,
    count(*) filter (where checked_in_at is not null)::integer,
    count(*) filter (where review_status = 'confirmed')::integer,
    count(*) filter (where checkin_method = 'manual')::integer
  from public.commercial_visits where greatest(created_at, visit_date::timestamptz,
    coalesce(checked_in_at, created_at)) < now() - interval '30 days'
  group by organization_id, seller_id, date_trunc('month', visit_date)::date
  on conflict (organization_id, seller_id, month) do update set
    visits = commercial_visit_monthly_metrics.visits + excluded.visits,
    confirmed = commercial_visit_monthly_metrics.confirmed + excluded.confirmed,
    manual = commercial_visit_monthly_metrics.manual + excluded.manual;
  delete from public.commercial_customer_locations
    where approved_at is null and created_at < now() - interval '30 days';
  delete from public.commercial_visits where greatest(created_at, visit_date::timestamptz,
    coalesce(checked_in_at, created_at)) < now() - interval '30 days';
end $$;
revoke all on function public.archive_commercial_visits() from public, anon, authenticated;
select cron.schedule('archive-commercial-visits', '15 3 * * *', $$select public.archive_commercial_visits()$$);
