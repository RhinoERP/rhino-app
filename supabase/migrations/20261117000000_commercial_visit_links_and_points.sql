-- Visits remain separate from delivery routes. Apply after the three 20261112 migrations.
-- Precise check-in coordinates are temporary; commercial history is not.
alter table public.commercial_visits drop constraint if exists commercial_visits_customer_id_fkey;
alter table public.commercial_visits add constraint commercial_visits_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete restrict;
create index commercial_visits_org_day on public.commercial_visits (organization_id, visit_date);
alter table public.commercial_visits add column no_documents_at_checkin boolean;

alter table public.sales_quote_requests add column if not exists prepared_on date;
create index commercial_quotes_visit_day on public.sales_quote_requests
  (organization_id, customer_id, created_by, prepared_on);

create table public.commercial_visit_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  visit_id uuid not null references public.commercial_visits(id) on delete restrict,
  quote_id uuid references public.sales_quote_requests(id) on delete restrict,
  sales_order_id uuid references public.sales_orders(id) on delete restrict,
  linked_by uuid not null,
  linked_at timestamptz not null default now(),
  origin text not null check (origin in ('selected', 'later', 'quote_conversion', 'quote_move')),
  check ((quote_id is not null) <> (sales_order_id is not null)),
  unique (quote_id), unique (sales_order_id)
);
create index commercial_visit_documents_visit on public.commercial_visit_documents (visit_id);

create table public.commercial_visit_document_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null check (document_type in ('quote', 'pre_sale')),
  document_id uuid not null,
  from_visit_id uuid references public.commercial_visits(id) on delete restrict,
  to_visit_id uuid not null references public.commercial_visits(id) on delete restrict,
  actor_id uuid not null,
  action text not null check (action in ('linked', 'moved', 'inherited')),
  created_at timestamptz not null default now()
);
create index commercial_visit_document_events_visit on public.commercial_visit_document_events (to_visit_id, id);

-- Pending/rejected proposals are separate from the approved customer master point.
-- An approved point is never overwritten until a replacement is approved.
create table public.commercial_location_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  visit_id uuid not null references public.commercial_visits(id) on delete restrict,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m between 0 and 1000),
  method text not null check (method in ('gps', 'pin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  proposed_by uuid not null,
  proposed_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  check ((status = 'pending' and latitude is not null and longitude is not null and reviewed_at is null)
    or (status = 'approved' and latitude is not null and longitude is not null and reviewed_at is not null)
    or (status = 'rejected' and latitude is null and longitude is null and reviewed_at is not null))
);
create unique index commercial_location_one_pending on public.commercial_location_proposals (organization_id, customer_id)
  where status = 'pending';

alter table public.commercial_visit_documents enable row level security;
alter table public.commercial_visit_document_events enable row level security;
alter table public.commercial_location_proposals enable row level security;
revoke all on public.commercial_visit_documents, public.commercial_visit_document_events,
  public.commercial_location_proposals from public, anon, authenticated;

-- Legacy pending points were generated without a seller action; they must not
-- appear in the new explicit proposal queue. Preserve already approved points.
delete from public.commercial_customer_locations where approved_at is null;

-- Return the existing link for an identical retry. A seller cannot change it;
-- an admin may move it, with an immutable event. Never auto-move on conversion.
create or replace function public.commercial_visit_link_document(
  p_org uuid, p_visit uuid, p_type text, p_document uuid, p_origin text default 'later')
returns void language plpgsql security definer set search_path = '' as $$
declare v_visit public.commercial_visits%rowtype; v_link public.commercial_visit_documents%rowtype;
  v_org uuid; v_customer uuid; v_seller uuid; v_day date; v_is_admin boolean; v_is_sale boolean := true;
begin
  v_is_admin := coalesce(public.user_has_org_permission('organization.admin', p_org), false);
  if auth.uid() is null or (not v_is_admin and not (
    public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org))) then
    raise exception 'Sin permiso para vincular documentos' using errcode = '42501';
  end if;
  if p_type not in ('quote', 'pre_sale') or p_origin not in ('selected', 'later', 'quote_conversion', 'quote_move') then
    raise exception 'Documento inválido' using errcode = '22023';
  end if;
  select * into v_visit from public.commercial_visits where id = p_visit and organization_id = p_org for update;
  if not found or v_visit.checked_in_at is null then
    raise exception 'La visita debe estar registrada' using errcode = '22023';
  end if;
  if not v_is_admin and v_visit.seller_id <> auth.uid() then
    raise exception 'La visita pertenece a otro vendedor' using errcode = '42501';
  end if;
  if p_type = 'quote' then
    select organization_id, customer_id, created_by,
      coalesce(prepared_on, created_at::date) into v_org, v_customer, v_seller, v_day
      from public.sales_quote_requests where id = p_document for update;
  else
    select organization_id, customer_id, user_id, sale_date,
      document_type = 'STANDARD' and is_historical is distinct from true
      into v_org, v_customer, v_seller, v_day, v_is_sale
      from public.sales_orders where id = p_document;
  end if;
  if v_is_sale is distinct from true or v_org is distinct from p_org or v_customer is distinct from v_visit.customer_id or
    (v_seller is distinct from v_visit.seller_id and not (p_type = 'pre_sale' and
      p_origin in ('quote_conversion', 'quote_move') and exists (
        select 1 from public.sales_quote_requests q
          join public.commercial_visit_documents d on d.quote_id = q.id and d.visit_id = p_visit
          where q.sales_order_id = p_document))) or
    (p_origin not in ('quote_conversion', 'quote_move') and v_day is distinct from v_visit.visit_date) then
    raise exception 'El documento no corresponde al cliente, vendedor y día de la visita' using errcode = '22023';
  end if;
  if p_type = 'pre_sale' and p_origin not in ('quote_conversion', 'quote_move') and exists (
    select 1 from public.sales_quote_requests q
      join public.commercial_visit_documents d on d.quote_id = q.id
      where q.sales_order_id = p_document and d.visit_id <> p_visit) then
    raise exception 'Mové primero la cotización que originó esta preventa' using errcode = '22023';
  end if;
  if p_type = 'quote' then
    select * into v_link from public.commercial_visit_documents where quote_id = p_document for update;
  else
    select * into v_link from public.commercial_visit_documents where sales_order_id = p_document for update;
  end if;
  if found then
    if v_link.visit_id = p_visit then return; end if;
    if not v_is_admin or p_origin = 'quote_conversion' then
      raise exception 'El documento ya pertenece a otra visita' using errcode = '22023';
    end if;
    update public.commercial_visit_documents set visit_id = p_visit, linked_by = auth.uid(),
      linked_at = now(), origin = p_origin where id = v_link.id;
    insert into public.commercial_visit_document_events
      (organization_id, document_type, document_id, from_visit_id, to_visit_id, actor_id, action)
      values (p_org, p_type, p_document, v_link.visit_id, p_visit, auth.uid(), 'moved');
  else
    insert into public.commercial_visit_documents
      (organization_id, visit_id, quote_id, sales_order_id, linked_by, origin)
      values (p_org, p_visit, case when p_type = 'quote' then p_document end,
        case when p_type = 'pre_sale' then p_document end, auth.uid(), p_origin);
    insert into public.commercial_visit_document_events
      (organization_id, document_type, document_id, to_visit_id, actor_id, action)
      values (p_org, p_type, p_document, p_visit, auth.uid(),
        case when p_origin = 'quote_conversion' then 'inherited' else 'linked' end);
  end if;
end $$;

-- Trigger executes inside the existing quote approval transaction, without
-- requiring a visit for normal quote approvals.
create or replace function public.commercial_quote_visit_inherit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_visit uuid; v_order public.sales_orders%rowtype; v_existing uuid;
begin
  if new.sales_order_id is null or new.sales_order_id is not distinct from old.sales_order_id then return new; end if;
  select visit_id into v_visit from public.commercial_visit_documents where quote_id = new.id;
  if v_visit is not null then
    -- Approval can run as a different org admin or a server job. Do not
    -- route it through the seller RPC; validate the resulting order here.
    select * into v_order from public.sales_orders where id = new.sales_order_id for update;
    if not found or v_order.organization_id is distinct from new.organization_id
      or v_order.customer_id is distinct from new.customer_id
      or v_order.document_type is distinct from 'STANDARD'
      or v_order.is_historical is true then
      raise exception 'La preventa aprobada no corresponde a la cotización' using errcode = '22023';
    end if;
    select visit_id into v_existing from public.commercial_visit_documents
      where sales_order_id = new.sales_order_id for update;
    if v_existing is not null and v_existing <> v_visit then
      raise exception 'La preventa ya pertenece a otra visita; requiere conciliación administrativa' using errcode = '22023';
    end if;
    if v_existing is null then
      insert into public.commercial_visit_documents
        (organization_id, visit_id, sales_order_id, linked_by, origin)
        values (new.organization_id, v_visit, new.sales_order_id, coalesce(auth.uid(), new.created_by), 'quote_conversion');
      insert into public.commercial_visit_document_events
        (organization_id, document_type, document_id, to_visit_id, actor_id, action)
        values (new.organization_id, 'pre_sale', new.sales_order_id, v_visit,
          coalesce(auth.uid(), new.created_by), 'inherited');
    end if;
  end if;
  return new;
end $$;
create trigger commercial_quote_visit_inherit after update of sales_order_id on public.sales_quote_requests
  for each row execute function public.commercial_quote_visit_inherit();

create or replace function public.commercial_visit_confirm(
  p_org uuid, p_visit uuid, p_lat double precision, p_lng double precision,
  p_accuracy double precision, p_manual boolean, p_quotes uuid[], p_orders uuid[], p_none boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_visit public.commercial_visits%rowtype; v_id uuid; v_route uuid; v_route_status text;
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or
    public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para registrar la visita' using errcode = '42501';
  end if;
  -- Match the existing route-close lock order: route first, then visit.
  select route_id into v_route from public.commercial_visits where id = p_visit
    and organization_id = p_org and seller_id = auth.uid();
  select status into v_route_status from public.commercial_routes where id = v_route
    and organization_id = p_org for update;
  select * into v_visit from public.commercial_visits where id = p_visit and organization_id = p_org
    and seller_id = auth.uid() for update;
  if not found or v_visit.visit_date < current_date - 1 or v_visit.visit_date > current_date then
    raise exception 'Visita no disponible' using errcode = '22023';
  end if;
  if p_quotes is null or p_orders is null or cardinality(p_quotes) > 100 or cardinality(p_orders) > 100 or
    p_none is null or (p_none and cardinality(p_quotes) + cardinality(p_orders) <> 0) or
    (not p_none and cardinality(p_quotes) + cardinality(p_orders) = 0) or
    (select count(distinct x) from unnest(p_quotes) x) <> cardinality(p_quotes) or
    (select count(distinct x) from unnest(p_orders) x) <> cardinality(p_orders) or
    array_position(p_quotes, null) is not null or array_position(p_orders, null) is not null then
    raise exception 'Selección de documentos inválida' using errcode = '22023';
  end if;
  if p_manual is null or p_manual and (p_lat is not null or p_lng is not null or p_accuracy is not null) or
    (not p_manual and (p_lat is null or p_lng is null or p_accuracy is null or
      not (p_lat between -90 and 90) or not (p_lng between -180 and 180) or
      not (p_accuracy between 0 and 1000))) then
    raise exception 'Ubicación inválida' using errcode = '22023';
  end if;
  if v_visit.checked_in_at is null then
    if v_route_status is distinct from 'open' then
      raise exception 'Reabrí la ruta antes de registrar la visita' using errcode = '22023';
    end if;
    update public.commercial_visits set checked_in_at = now(),
      checkin_method = case when p_manual then 'manual' else 'gps' end,
      latitude = case when p_manual then null else p_lat end,
      longitude = case when p_manual then null else p_lng end,
      accuracy_m = case when p_manual then null else p_accuracy end,
      review_status = 'confirmed', no_documents_at_checkin = p_none where id = p_visit;
  end if;
  foreach v_id in array p_quotes loop
    perform public.commercial_visit_link_document(p_org, p_visit, 'quote', v_id, 'selected');
    -- A previously approved quote already has its resulting order.
    perform public.commercial_visit_link_document(p_org, p_visit, 'pre_sale', q.sales_order_id, 'quote_conversion')
      from public.sales_quote_requests q where q.id = v_id and q.sales_order_id is not null;
  end loop;
  foreach v_id in array p_orders loop
    perform public.commercial_visit_link_document(p_org, p_visit, 'pre_sale', v_id, 'selected');
  end loop;
end $$;

-- When linking a quote later, inherit its existing order in the same transaction.
create or replace function public.commercial_visit_link_later(
  p_org uuid, p_visit uuid, p_type text, p_document uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order uuid;
begin
  perform public.commercial_visit_link_document(p_org, p_visit, p_type, p_document, 'later');
  if p_type = 'quote' then
    select sales_order_id into v_order from public.sales_quote_requests where id = p_document;
    if v_order is not null then
      -- A deliberate admin move may move the already-inherited order too.
      if exists (select 1 from public.commercial_visit_documents
          where sales_order_id = v_order and visit_id <> p_visit) then
        perform public.commercial_visit_link_document(p_org, p_visit, 'pre_sale', v_order, 'quote_move');
      else
        perform public.commercial_visit_link_document(p_org, p_visit, 'pre_sale', v_order, 'quote_conversion');
      end if;
    end if;
  end if;
end $$;

-- A legacy RPC must not remain usable to generate implicit customer points.
revoke all on function public.commercial_visit_checkin(uuid,uuid,double precision,double precision,double precision,boolean)
  from public, anon, authenticated;
revoke all on function public.commercial_visit_review(uuid,uuid,boolean) from public, anon, authenticated;

create or replace function public.commercial_location_propose(
  p_org uuid, p_visit uuid, p_lat double precision, p_lng double precision,
  p_accuracy double precision, p_method text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_visit public.commercial_visits%rowtype; v_id uuid;
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or
    public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para proponer puntos' using errcode = '42501';
  end if;
  select * into v_visit from public.commercial_visits where id = p_visit and organization_id = p_org
    and seller_id = auth.uid() for update;
  if not found or v_visit.checked_in_at is null or p_method is null or p_method not in ('gps', 'pin') or
    p_lat is null or p_lng is null or not (p_lat between -90 and 90) or
    not (p_lng between -180 and 180) or
    (p_method = 'gps' and (p_accuracy is null or not (p_accuracy between 0 and 1000))) or
    (p_method = 'pin' and p_accuracy is not null) then
    raise exception 'Punto o visita inválida' using errcode = '22023';
  end if;
  insert into public.commercial_location_proposals
    (organization_id, customer_id, visit_id, latitude, longitude, accuracy_m, method, proposed_by)
    values (p_org, v_visit.customer_id, p_visit, p_lat, p_lng, p_accuracy, p_method, auth.uid())
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.commercial_location_decide(p_org uuid, p_proposal uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_proposal public.commercial_location_proposals%rowtype;
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso para aprobar puntos' using errcode = '42501';
  end if;
  select * into v_proposal from public.commercial_location_proposals
    where id = p_proposal and organization_id = p_org and status = 'pending' for update;
  if not found then raise exception 'Propuesta no disponible' using errcode = '22023'; end if;
  if p_approve is null or (not p_approve and (p_reason is null or length(btrim(p_reason)) < 1 or length(p_reason) > 1000)) then
    raise exception 'Indicá el motivo del rechazo' using errcode = '22023';
  end if;
  if p_approve then
    insert into public.commercial_customer_locations
      (organization_id, customer_id, latitude, longitude, proposed_by_visit_id, approved_by, approved_at)
      values (p_org, v_proposal.customer_id, v_proposal.latitude, v_proposal.longitude,
        v_proposal.visit_id, auth.uid(), now())
      on conflict (customer_id) do update set latitude = excluded.latitude,
        longitude = excluded.longitude, proposed_by_visit_id = excluded.proposed_by_visit_id,
        approved_by = excluded.approved_by, approved_at = excluded.approved_at;
  end if;
  update public.commercial_location_proposals set status = case when p_approve then 'approved' else 'rejected' end,
    latitude = case when p_approve then latitude end,
    longitude = case when p_approve then longitude end,
    accuracy_m = case when p_approve then accuracy_m end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_reason = nullif(btrim(p_reason), '')
    where id = p_proposal;
end $$;
revoke all on function public.commercial_location_approve(uuid,uuid),
  public.commercial_location_reject(uuid,uuid) from public, anon, authenticated;

-- An old check-in trigger forbids changing coordinates. Allow ONLY the
-- post-retention nullification, never changing the check-in timestamp/method.
create or replace function public.commercial_route_checkin_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text; v_purge boolean;
begin
  if old.checked_in_at is null and new.checked_in_at is not null then
    select status into v_status from public.commercial_routes where id = old.route_id for update;
    if v_status <> 'open' then raise exception 'Reabrí la ruta antes de registrar la llegada' using errcode = '22023'; end if;
  end if;
  v_purge := old.checked_in_at is not null and old.checked_in_at < now() - interval '30 days'
    and old.latitude is not null and new.latitude is null and new.longitude is null
    and new.accuracy_m is null and new.checked_in_at is not distinct from old.checked_in_at
    and new.checkin_method is not distinct from old.checkin_method;
  if old.checked_in_at is not null and not v_purge and
    (new.checked_in_at is distinct from old.checked_in_at or new.latitude is distinct from old.latitude or
     new.longitude is distinct from old.longitude or new.accuracy_m is distinct from old.accuracy_m or
     new.checkin_method is distinct from old.checkin_method) then
    raise exception 'La evidencia de la visita no se puede modificar' using errcode = '22023';
  end if;
  return new;
end $$;

create or replace function public.archive_commercial_visits()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.commercial_visits set latitude = null, longitude = null, accuracy_m = null
    where checked_in_at < now() - interval '30 days' and latitude is not null;
  -- Monthly aggregates from the old purge remain available for visits deleted
  -- before this migration; surviving visits are counted from the visit table.
end $$;
revoke all on function public.archive_commercial_visits() from public, anon, authenticated;

revoke all on function public.commercial_visit_confirm(uuid,uuid,double precision,double precision,double precision,boolean,uuid[],uuid[],boolean),
  public.commercial_visit_link_document(uuid,uuid,text,uuid,text),
  public.commercial_visit_link_later(uuid,uuid,text,uuid),
  public.commercial_location_propose(uuid,uuid,double precision,double precision,double precision,text),
  public.commercial_location_decide(uuid,uuid,boolean,text) from public, anon;
grant execute on function public.commercial_visit_confirm(uuid,uuid,double precision,double precision,double precision,boolean,uuid[],uuid[],boolean),
  public.commercial_visit_link_later(uuid,uuid,text,uuid),
  public.commercial_location_propose(uuid,uuid,double precision,double precision,double precision,text),
  public.commercial_location_decide(uuid,uuid,boolean,text) to authenticated;
-- This helper is invoked by the guarded RPCs and the quote trigger only.
revoke all on function public.commercial_visit_link_document(uuid,uuid,text,uuid,text) from authenticated;

-- Persist the preparation day during the existing idempotent offline insert.
-- The submitted day is checked by the application against the command timestamp;
-- this field is not used to authorize visits by itself.
create or replace function public.create_sales_quote_request_idempotent(
  p_idempotency_key uuid, p_request jsonb, p_items jsonb)
returns table(request_id uuid, duplicate boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare v_org_id uuid := nullif(p_request->>'organization_id', '')::uuid;
  v_seller_id uuid := nullif(p_request->>'created_by', '')::uuid;
  v_payload_hash text; v_existing public.sales_quote_request_idempotency%rowtype; v_request_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Operación de servidor requerida'; end if;
  if p_idempotency_key is null or v_org_id is null or v_seller_id is null then
    raise exception 'Clave idempotente o identidad inválida';
  end if;
  v_payload_hash := encode(digest(jsonb_build_object(
    'request', p_request - 'offline_snapshot_was_expired' - 'offline_cost_snapshot_incomplete' - 'prepared_on',
    'items', p_items)::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    v_org_id::text || ':' || v_seller_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing from public.sales_quote_request_idempotency i
    where i.organization_id = v_org_id and i.seller_user_id = v_seller_id
      and i.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.payload_hash <> v_payload_hash then raise exception 'OFFLINE_IDEMPOTENCY_CONFLICT'; end if;
    return query select v_existing.request_id, true;
    return;
  end if;
  v_request_id := public.create_sales_quote_request(p_request - 'prepared_on', p_items);
  update public.sales_quote_requests set
    offline_snapshot_id = nullif(p_request->>'offline_snapshot_id', '')::uuid,
    offline_snapshot_generated_at = nullif(p_request->>'offline_snapshot_generated_at', '')::timestamptz,
    offline_snapshot_expires_at = nullif(p_request->>'offline_snapshot_expires_at', '')::timestamptz,
    offline_snapshot_was_expired = coalesce((p_request->>'offline_snapshot_was_expired')::boolean, false),
    offline_cost_snapshot_incomplete = coalesce((p_request->>'offline_cost_snapshot_incomplete')::boolean, false),
    prepared_on = nullif(p_request->>'prepared_on', '')::date
    where id = v_request_id;
  insert into public.sales_quote_request_idempotency
    (organization_id, seller_user_id, idempotency_key, payload_hash, request_id)
    values (v_org_id, v_seller_id, p_idempotency_key, v_payload_hash, v_request_id);
  return query select v_request_id, false;
end $$;
revoke all on function public.create_sales_quote_request_idempotent(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_sales_quote_request_idempotent(uuid,jsonb,jsonb) to service_role;

-- Preserve the existing online quote creation RPC and its validation; only
-- persist the seller's local preparation day in the same transaction.
create or replace function public.create_sales_quote_request_with_day(p_request jsonb, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_day date := nullif(p_request->>'prepared_on', '')::date;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación de servidor requerida' using errcode = '42501';
  end if;
  if v_day is not null and abs(v_day - current_date) > 1 then
    raise exception 'Fecha de preparación inválida' using errcode = '22023';
  end if;
  v_id := public.create_sales_quote_request(p_request - 'prepared_on', p_items);
  update public.sales_quote_requests set prepared_on = coalesce(v_day, current_date) where id = v_id;
  return v_id;
end $$;
revoke all on function public.create_sales_quote_request_with_day(jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_sales_quote_request_with_day(jsonb,jsonb) to service_role;

-- Candidate and history queries have the same seller/admin scope as the write RPCs.
create or replace function public.commercial_visit_document_candidates(p_org uuid, p_visit uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_visit public.commercial_visits%rowtype;
begin
  select * into v_visit from public.commercial_visits where id = p_visit and organization_id = p_org;
  if not found or auth.uid() is null or (v_visit.seller_id <> auth.uid() and
    not public.user_has_org_permission('organization.admin', p_org)) or
    (v_visit.seller_id = auth.uid() and not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or
    public.user_has_org_permission('organization.admin', p_org))) then
    raise exception 'Sin permiso para consultar documentos' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'quotes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', q.id, 'status', q.status, 'total', q.total_amount, 'createdAt', q.created_at,
      'linkedVisitId', d.visit_id, 'salesOrderId', q.sales_order_id) order by q.created_at desc)
      from public.sales_quote_requests q left join public.commercial_visit_documents d on d.quote_id = q.id
      where q.organization_id = p_org and q.customer_id = v_visit.customer_id
        and q.created_by = v_visit.seller_id and
        coalesce(q.prepared_on, q.created_at::date) = v_visit.visit_date), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'status', o.status, 'total', o.total_amount, 'createdAt', o.created_at,
      'linkedVisitId', d.visit_id) order by o.created_at desc)
      from public.sales_orders o left join public.commercial_visit_documents d on d.sales_order_id = o.id
      where o.organization_id = p_org and o.customer_id = v_visit.customer_id and
        o.user_id = v_visit.seller_id and o.sale_date = v_visit.visit_date
        and o.document_type = 'STANDARD' and o.is_historical is distinct from true), '[]'::jsonb)
  );
end $$;

create or replace function public.commercial_visit_document_history(p_org uuid, p_visit uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_visit public.commercial_visits%rowtype;
begin
  select * into v_visit from public.commercial_visits where id = p_visit and organization_id = p_org;
  if not found or auth.uid() is null or (v_visit.seller_id <> auth.uid() and
    not public.user_has_org_permission('organization.admin', p_org)) or
    (v_visit.seller_id = auth.uid() and not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or
    public.user_has_org_permission('organization.admin', p_org))) then
    raise exception 'Sin permiso para consultar la visita' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'visit', jsonb_build_object('routeId', v_visit.route_id, 'checkedInAt', v_visit.checked_in_at,
      'method', v_visit.checkin_method, 'latitude', v_visit.latitude,
      'longitude', v_visit.longitude, 'accuracyM', v_visit.accuracy_m,
      'correctionReason', v_visit.correction_reason, 'correctedAt', v_visit.corrected_at,
      'skipReason', v_visit.skip_reason,
      'noDocumentsAtCheckin', v_visit.no_documents_at_checkin),
    'opportunities', (select count(*) from public.commercial_visit_documents d
      where d.visit_id = p_visit and (d.quote_id is not null or not exists (
        select 1 from public.sales_quote_requests q
          join public.commercial_visit_documents qd on qd.quote_id = q.id and qd.visit_id = p_visit
          where q.sales_order_id = d.sales_order_id))),
    'links', coalesce((select jsonb_agg(jsonb_build_object(
      'type', case when d.quote_id is not null then 'quote' else 'pre_sale' end,
      'id', coalesce(d.quote_id, d.sales_order_id), 'status', coalesce(q.status::text, o.status::text),
      'origin', d.origin, 'linkedAt', d.linked_at, 'linkedBy', d.linked_by,
      'salesOrderId', q.sales_order_id) order by d.linked_at)
      from public.commercial_visit_documents d
      left join public.sales_quote_requests q on q.id = d.quote_id
      left join public.sales_orders o on o.id = d.sales_order_id
      where d.visit_id = p_visit and d.organization_id = p_org), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'type', e.document_type, 'id', e.document_id, 'action', e.action,
      'actorId', e.actor_id, 'fromVisitId', e.from_visit_id,
      'toVisitId', e.to_visit_id, 'createdAt', e.created_at) order by e.id)
      from public.commercial_visit_document_events e
      where e.organization_id = p_org and (e.from_visit_id = p_visit or e.to_visit_id = p_visit)), '[]'::jsonb)
  );
end $$;

create or replace function public.commercial_visit_review_queue(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso de supervisión' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'visits', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'sellerId', v.seller_id,
      'sellerName', coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, 'Usuario no disponible'),
      'customerName', coalesce(c.fantasy_name, c.business_name), 'checkedInAt', v.checked_in_at,
      'method', v.checkin_method, 'latitude', v.latitude, 'longitude', v.longitude,
      'accuracyM', v.accuracy_m, 'distanceM', null) order by v.checked_in_at desc)
      from public.commercial_visits v join public.customers c on c.id = v.customer_id
      left join auth.users u on u.id = v.seller_id
      where v.organization_id = p_org and v.checked_in_at >= now() - interval '30 days'), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(jsonb_build_object(
      'proposalId', p.id, 'customerId', p.customer_id, 'customerName', coalesce(c.fantasy_name, c.business_name),
      'latitude', p.latitude, 'longitude', p.longitude, 'accuracyM', p.accuracy_m,
      'method', p.method, 'visitId', p.visit_id) order by p.proposed_at)
      from public.commercial_location_proposals p join public.customers c on c.id = p.customer_id
      where p.organization_id = p_org and p.status = 'pending'), '[]'::jsonb),
    'dayOverview', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'sellerId', v.seller_id,
      'sellerName', coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, 'Usuario no disponible'),
      'customerName', coalesce(c.fantasy_name, c.business_name), 'visitDate', v.visit_date,
      'checkedInAt', v.checked_in_at, 'reviewStatus', v.review_status,
      'latitude', l.latitude, 'longitude', l.longitude) order by v.seller_id, v.created_at)
      from public.commercial_visits v join public.customers c on c.id = v.customer_id
      left join auth.users u on u.id = v.seller_id
      left join public.commercial_customer_locations l on l.customer_id = v.customer_id and l.organization_id = p_org
      and l.approved_at is not null
      where v.organization_id = p_org and v.visit_date between current_date - 1 and current_date), '[]'::jsonb),
    'monthlyMetrics', coalesce((select jsonb_agg(jsonb_build_object(
      'sellerId', m.seller_id,
      'sellerName', coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, 'Usuario no disponible'),
      'month', m.month, 'visits', m.visits, 'confirmed', m.confirmed, 'manual', m.manual)
      order by m.month desc, m.seller_id)
       from (select seller_id, month, sum(visits)::integer as visits,
         sum(confirmed)::integer as confirmed, sum(manual)::integer as manual
         from (select v.seller_id, date_trunc('month', v.visit_date)::date as month,
           count(*) filter (where v.checked_in_at is not null)::integer as visits,
           count(*) filter (where v.review_status = 'confirmed')::integer as confirmed,
           count(*) filter (where v.checkin_method = 'manual')::integer as manual
           from public.commercial_visits v where v.organization_id = p_org
             and v.visit_date >= date_trunc('month', current_date - interval '24 months')::date
           group by v.seller_id, date_trunc('month', v.visit_date)::date
           union all
           select legacy.seller_id, legacy.month, legacy.visits, legacy.confirmed, legacy.manual
           from public.commercial_visit_monthly_metrics legacy where legacy.organization_id = p_org
             and legacy.month >= date_trunc('month', current_date - interval '24 months')::date) all_months
         group by seller_id, month) m
       left join auth.users u on u.id = m.seller_id), '[]'::jsonb)
  );
end $$;

revoke all on function public.commercial_visit_document_candidates(uuid,uuid),
  public.commercial_visit_document_history(uuid,uuid), public.commercial_visit_review_queue(uuid)
  from public, anon;
grant execute on function public.commercial_visit_document_candidates(uuid,uuid),
  public.commercial_visit_document_history(uuid,uuid) to authenticated;

-- Historical views query exact dates rather than retaining precise location.
create or replace function public.commercial_visit_admin_day(p_org uuid, p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso de supervisión' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', v.id, 'sellerId', v.seller_id,
    'sellerName', coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, 'Usuario no disponible'),
    'customerName', coalesce(c.fantasy_name, c.business_name), 'checkedInAt', v.checked_in_at,
    'method', v.checkin_method, 'latitude', v.latitude, 'longitude', v.longitude,
    'accuracyM', v.accuracy_m, 'distanceM', null) order by v.created_at)
    from public.commercial_visits v join public.customers c on c.id = v.customer_id
    left join auth.users u on u.id = v.seller_id
    where v.organization_id = p_org and v.visit_date = p_day and v.checked_in_at is not null), '[]'::jsonb);
end $$;
revoke all on function public.commercial_visit_admin_day(uuid,date) from public, anon;
grant execute on function public.commercial_visit_admin_day(uuid,date) to authenticated;

create or replace function public.commercial_route_day(p_org uuid, p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or
    public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if p_day > current_date + 7 then raise exception 'Fecha fuera de rango' using errcode = '22023'; end if;
  return jsonb_build_object(
    'routes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'number', r.route_number, 'status', r.status, 'closedAt', r.closed_at,
      'visits', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'customerId', v.customer_id, 'customerName', coalesce(c.fantasy_name, c.business_name),
        'plannedPosition', v.planned_position, 'checkedInAt', v.checked_in_at, 'method', v.checkin_method,
        'reviewStatus', v.review_status, 'hasLocation', l.approved_at is not null,
        'hasPendingLocation', exists (select 1 from public.commercial_location_proposals p
          where p.organization_id = p_org and p.customer_id = v.customer_id and p.status = 'pending'),
        'skipReason', v.skip_reason, 'correctedAt', v.corrected_at, 'correctionReason', v.correction_reason)
        order by v.planned_position) from public.commercial_visits v
        join public.customers c on c.id = v.customer_id
        left join public.commercial_customer_locations l on l.customer_id = c.id and l.organization_id = p_org
        where v.route_id = r.id), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'actorId', e.actor_id,
        'createdAt', e.created_at, 'details', e.details) order by e.id)
        from public.commercial_route_events e where e.route_id = r.id), '[]'::jsonb)) order by r.route_number)
      from public.commercial_routes r where r.organization_id = p_org and r.seller_id = v_user
        and r.route_date = p_day), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id,
      'name', coalesce(c.fantasy_name, c.business_name)) order by c.business_name)
      from public.customers c where c.organization_id = p_org and c.is_active
      and (c.assigned_seller_id is null or c.assigned_seller_id = v_user)), '[]'::jsonb)
  );
end $$;
