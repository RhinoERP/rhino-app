-- Proposals from the customer detail page are separate from check-in evidence.
-- A seller cannot write an approved site; only the admin decision does so.
create table public.commercial_site_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_id uuid,
  name text not null check (length(btrim(name)) between 1 and 120),
  address text not null check (length(btrim(address)) between 1 and 500),
  city text not null check (length(btrim(city)) between 1 and 120),
  postal_code text not null default '' check (length(postal_code) <= 16),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  proposed_by uuid not null,
  proposed_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  foreign key (organization_id, customer_id, site_id)
    references public.customer_sites(organization_id, customer_id, id) on delete restrict,
  check ((status = 'pending' and latitude is not null and longitude is not null and reviewed_at is null)
    or (status = 'approved' and latitude is not null and longitude is not null and reviewed_at is not null)
    or (status = 'rejected' and latitude is null and longitude is null and reviewed_at is not null))
);
create unique index commercial_site_proposals_pending_site
  on public.commercial_site_proposals (site_id) where status = 'pending' and site_id is not null;
create unique index commercial_site_proposals_pending_new_name
  on public.commercial_site_proposals
  (organization_id, customer_id, lower(btrim(name)))
  where status = 'pending' and site_id is null;
create index commercial_site_proposals_review
  on public.commercial_site_proposals (organization_id, proposed_at) where status = 'pending';
alter table public.commercial_site_proposals enable row level security;
revoke all on public.commercial_site_proposals from public, anon, authenticated;

create function public.commercial_site_propose_from_customer(
  p_org uuid, p_customer uuid, p_site uuid, p_name text, p_address text,
  p_city text, p_postal_code text, p_lat double precision, p_lng double precision)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org)
    or public.user_has_org_permission('sales.manage.all', p_org)
    or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para proponer sucursales' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customers c where c.id = p_customer
      and c.organization_id = p_org and c.is_active
      and (public.user_has_org_permission('organization.admin', p_org)
        or c.assigned_seller_id is null or c.assigned_seller_id = auth.uid())) then
    raise exception 'Cliente no disponible para este vendedor' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120
    or p_address is null or length(btrim(p_address)) not between 1 and 500
    or p_city is null or length(btrim(p_city)) not between 1 and 120
    or length(coalesce(p_postal_code, '')) > 16
    or p_lat is null or p_lng is null
    or not (p_lat between -90 and 90) or not (p_lng between -180 and 180) then
    raise exception 'Punto o dirección inválida' using errcode = '22023';
  end if;
  if p_site is not null and not exists (
      select 1 from public.customer_sites s where s.id = p_site and s.organization_id = p_org
        and s.customer_id = p_customer and s.active) then
    raise exception 'Sucursal no disponible' using errcode = '22023';
  end if;
  if p_site is null and exists (
      select 1 from public.customer_sites s where s.organization_id = p_org
        and s.customer_id = p_customer and s.active
        and lower(btrim(s.name)) = lower(btrim(p_name))) then
    raise exception 'La sucursal ya existe; proponé el punto sobre la existente' using errcode = '22023';
  end if;
  if p_site is null and exists (
      select 1 from public.commercial_site_proposals p where p.organization_id = p_org
        and p.customer_id = p_customer and p.site_id is null and p.status = 'pending'
        and lower(btrim(p.name)) = lower(btrim(p_name))) then
    raise exception 'Ya hay una propuesta pendiente para esta sucursal' using errcode = '22023';
  end if;
  insert into public.commercial_site_proposals
    (organization_id, customer_id, site_id, name, address, city, postal_code,
      latitude, longitude, proposed_by)
    values (p_org, p_customer, p_site, btrim(p_name), btrim(p_address), btrim(p_city),
      btrim(coalesce(p_postal_code, '')), p_lat, p_lng, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function public.commercial_site_proposal_queue(p_org uuid, p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_admin boolean;
begin
  v_admin := coalesce(public.user_has_org_permission('organization.admin', p_org), false);
  if auth.uid() is null or not (v_admin
    or public.user_has_org_permission('sales.manage', p_org)
    or public.user_has_org_permission('sales.manage.all', p_org)) then
    raise exception 'Sin permiso para consultar propuestas' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', p.id, 'customerId', p.customer_id,
    'customerName', coalesce(c.fantasy_name, c.business_name), 'siteId', p.site_id,
    'name', p.name, 'address', p.address, 'city', p.city,
    'postalCode', p.postal_code, 'latitude', p.latitude, 'longitude', p.longitude,
    'proposedAt', p.proposed_at) order by p.proposed_at, p.id)
    from public.commercial_site_proposals p
    join public.customers c on c.id = p.customer_id and c.organization_id = p_org
    where p.organization_id = p_org and p.status = 'pending'
      and (p_customer is null or p.customer_id = p_customer)
      and (v_admin or (p.proposed_by = auth.uid()
        and (c.assigned_seller_id is null or c.assigned_seller_id = auth.uid())))), '[]'::jsonb);
end $$;

create function public.commercial_site_proposal_decide(
  p_org uuid, p_proposal uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_proposal public.commercial_site_proposals%rowtype;
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Solo el administrador puede aprobar sucursales' using errcode = '42501';
  end if;
  select * into v_proposal from public.commercial_site_proposals
    where id = p_proposal and organization_id = p_org and status = 'pending' for update;
  if not found or p_approve is null or (not p_approve
    and (p_reason is null or length(btrim(p_reason)) not between 1 and 1000)) then
    raise exception 'Propuesta no disponible o motivo inválido' using errcode = '22023';
  end if;
  if p_approve then
    if v_proposal.site_id is null then
      insert into public.customer_sites (organization_id, customer_id, name, address, city,
        postal_code, latitude, longitude, active)
        values (p_org, v_proposal.customer_id, v_proposal.name, v_proposal.address,
          v_proposal.city, v_proposal.postal_code, v_proposal.latitude, v_proposal.longitude, true);
    else
      update public.customer_sites set name = v_proposal.name,
        address = v_proposal.address, city = v_proposal.city,
        postal_code = v_proposal.postal_code, latitude = v_proposal.latitude,
        longitude = v_proposal.longitude, updated_at = now()
        where id = v_proposal.site_id and organization_id = p_org
          and customer_id = v_proposal.customer_id and active;
      if not found then
        raise exception 'La sucursal cambió; revisá la propuesta' using errcode = '22023';
      end if;
    end if;
  end if;
  update public.commercial_site_proposals set
    status = case when p_approve then 'approved' else 'rejected' end,
    latitude = case when p_approve then latitude end,
    longitude = case when p_approve then longitude end,
    reviewed_by = auth.uid(), reviewed_at = now(),
    review_reason = nullif(btrim(p_reason), '')
    where id = p_proposal;
end $$;

revoke all on function public.commercial_site_propose_from_customer(
  uuid,uuid,uuid,text,text,text,text,double precision,double precision),
  public.commercial_site_proposal_queue(uuid,uuid),
  public.commercial_site_proposal_decide(uuid,uuid,boolean,text) from public, anon;
grant execute on function public.commercial_site_propose_from_customer(
  uuid,uuid,uuid,text,text,text,text,double precision,double precision),
  public.commercial_site_proposal_queue(uuid,uuid),
  public.commercial_site_proposal_decide(uuid,uuid,boolean,text) to authenticated;
