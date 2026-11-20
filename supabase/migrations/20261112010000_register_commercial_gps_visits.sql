-- Visits count as soon as the seller checks in. Only manual, imprecise or
-- unexpectedly distant GPS check-ins need optional follow-up. Customer points
-- still require separate approval before they can be used as reference points.
create or replace function public.commercial_visit_checkin(
  p_org uuid, p_visit uuid, p_lat double precision default null,
  p_lng double precision default null, p_accuracy double precision default null,
  p_manual boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_visit public.commercial_visits%rowtype;
  v_location public.commercial_customer_locations%rowtype;
  v_distance double precision;
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
    return; -- Preserve the original check-in on retries.
  end if;
  if not p_manual and (p_lat is null or p_lng is null or p_accuracy is null
    or not (p_lat between -90 and 90) or not (p_lng between -180 and 180)
    or not (p_accuracy between 0 and 1000)) then
    raise exception 'Ubicación inválida' using errcode = '22023';
  end if;

  if not p_manual then
    select * into v_location from public.commercial_customer_locations
      where organization_id = p_org and customer_id = v_visit.customer_id and approved_at is not null;
    if found then
      v_distance := 6371000 * 2 * asin(sqrt(least(1,
        power(sin(radians((p_lat - v_location.latitude) / 2)), 2) +
        cos(radians(v_location.latitude)) * cos(radians(p_lat)) *
        power(sin(radians((p_lng - v_location.longitude) / 2)), 2)
      )));
    end if;
  end if;

  update public.commercial_visits set checked_in_at = now(),
    checkin_method = case when p_manual then 'manual' else 'gps' end,
    latitude = case when p_manual then null else p_lat end,
    longitude = case when p_manual then null else p_lng end,
    accuracy_m = case when p_manual then null else p_accuracy end,
    review_status = case
      when not p_manual and p_accuracy <= 100
        and (v_distance is null or v_distance <= 150 + p_accuracy) then 'confirmed'
      else 'pending'
    end
    where id = p_visit;

  -- A first accurate GPS reading only proposes the customer location;
  -- the administrator still decides whether to approve that master record.
  if not p_manual and p_accuracy <= 100 then
    insert into public.commercial_customer_locations
      (organization_id, customer_id, latitude, longitude, proposed_by_visit_id)
      values (p_org, v_visit.customer_id, p_lat, p_lng, p_visit)
      on conflict (customer_id) do nothing;
  end if;
end $$;

-- Upgrade precise GPS check-ins created before this migration. Manual and
-- out-of-range check-ins remain in the exception queue, but already count via
-- their checked_in_at timestamp. Leave previously reviewed rows unchanged.
update public.commercial_visits v
set review_status = 'confirmed'
from public.commercial_customer_locations l
where v.customer_id = l.customer_id and v.organization_id = l.organization_id
  and v.review_status = 'pending' and v.checkin_method = 'gps'
  and v.accuracy_m <= 100
  and (l.approved_at is null or 6371000 * 2 * asin(sqrt(least(1,
    power(sin(radians((v.latitude - l.latitude) / 2)), 2) +
    cos(radians(l.latitude)) * cos(radians(v.latitude)) *
    power(sin(radians((v.longitude - l.longitude) / 2)), 2)
  ))) <= 150 + v.accuracy_m);

update public.commercial_visits v
set review_status = 'confirmed'
where v.review_status = 'pending' and v.checkin_method = 'gps' and v.accuracy_m <= 100
  and not exists (select 1 from public.commercial_customer_locations l
    where l.customer_id = v.customer_id and l.organization_id = v.organization_id and l.approved_at is not null);
