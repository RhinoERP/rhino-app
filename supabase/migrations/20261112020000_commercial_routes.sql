-- Apply AFTER both commercial visit migrations. Commercial routes are not delivery route sheets.
create table public.commercial_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  seller_id uuid not null,
  route_date date not null,
  route_number integer not null check (route_number > 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (organization_id, seller_id, route_date, route_number)
);
create index commercial_routes_seller_date on public.commercial_routes (organization_id, seller_id, route_date);

alter table public.commercial_visits add column route_id uuid references public.commercial_routes(id) on delete restrict;
alter table public.commercial_visits add column planned_position integer;
alter table public.commercial_visits add column skip_reason text;
alter table public.commercial_visits add column corrected_at timestamptz;
alter table public.commercial_visits add column corrected_by uuid;
alter table public.commercial_visits add column correction_reason text;

-- Backfill legacy day lists without touching their original arrival timestamps/coordinates.
insert into public.commercial_routes (organization_id, seller_id, route_date, route_number)
select distinct organization_id, seller_id, visit_date, 1 from public.commercial_visits
on conflict (organization_id, seller_id, route_date, route_number) do nothing;
with numbered as (
  select v.id, r.id as route_id,
    row_number() over (partition by r.id order by v.created_at, v.id)::integer as position
  from public.commercial_visits v join public.commercial_routes r on
    r.organization_id = v.organization_id and r.seller_id = v.seller_id
    and r.route_date = v.visit_date and r.route_number = 1
)
update public.commercial_visits v set route_id = n.route_id, planned_position = n.position
from numbered n where v.id = n.id;
alter table public.commercial_visits alter column route_id set not null;
alter table public.commercial_visits alter column planned_position set not null;
alter table public.commercial_visits add constraint commercial_visits_position_positive check (planned_position > 0);
alter table public.commercial_visits add constraint commercial_visits_skip_reason_nonempty check (skip_reason is null or length(btrim(skip_reason)) > 0);
alter table public.commercial_visits add constraint commercial_visits_correction_complete check (
  (corrected_at is null and corrected_by is null and correction_reason is null) or
  (checked_in_at is not null and corrected_at is not null and corrected_by is not null and length(btrim(correction_reason)) > 0));
do $$
declare v_constraint text;
begin
  -- PostgreSQL truncates generated constraint names at 63 bytes.
  select conname into v_constraint from pg_constraint
    where conrelid = 'public.commercial_visits'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (organization_id, seller_id, customer_id, visit_date)';
  if v_constraint is null then raise exception 'No se encontró la restricción única anterior de visitas'; end if;
  execute format('alter table public.commercial_visits drop constraint %I', v_constraint);
end $$;
create unique index commercial_visits_route_customer on public.commercial_visits (route_id, customer_id);
create unique index commercial_visits_route_position on public.commercial_visits (route_id, planned_position);

create table public.commercial_route_events (
  id bigint generated always as identity primary key,
  route_id uuid not null references public.commercial_routes(id) on delete restrict,
  actor_id uuid not null,
  action text not null check (action in ('created', 'reordered', 'closed', 'reopened', 'corrected')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index commercial_route_events_route on public.commercial_route_events (route_id, id);
alter table public.commercial_routes enable row level security;
alter table public.commercial_route_events enable row level security;
revoke all on public.commercial_routes, public.commercial_route_events from public, anon, authenticated;

create or replace function public.commercial_route_create(p_org uuid, p_day date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_number integer; v_id uuid;
begin
  if v_user is null or not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para rutas comerciales' using errcode = '42501';
  end if;
  if p_day < current_date - 1 or p_day > current_date + 7 then
    raise exception 'Fecha fuera del rango permitido' using errcode = '22023';
  end if;
  -- Serialize route numbering for a seller/day, even if no routes exist yet.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || v_user::text || p_day::text, 0));
  select coalesce(max(route_number), 0) + 1 into v_number from public.commercial_routes
    where organization_id = p_org and seller_id = v_user and route_date = p_day;
  insert into public.commercial_routes (organization_id, seller_id, route_date, route_number)
    values (p_org, v_user, p_day, v_number) returning id into v_id;
  insert into public.commercial_route_events (route_id, actor_id, action)
    values (v_id, v_user, 'created');
  return v_id;
end $$;

create or replace function public.commercial_route_add_visit(p_org uuid, p_route uuid, p_customer uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_route public.commercial_routes%rowtype; v_id uuid; v_position integer;
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para visitas comerciales' using errcode = '42501';
  end if;
  select * into v_route from public.commercial_routes where id = p_route and organization_id = p_org and seller_id = auth.uid() for update;
  if not found or v_route.status <> 'open' or v_route.route_date < current_date - 1 or v_route.route_date > current_date + 7 then
    raise exception 'Ruta no disponible' using errcode = '22023';
  end if;
  if not exists (select 1 from public.customers where id = p_customer and organization_id = p_org
    and is_active and (assigned_seller_id is null or assigned_seller_id = auth.uid())) then
    raise exception 'Cliente no disponible para este vendedor' using errcode = '42501';
  end if;
  select id into v_id from public.commercial_visits where route_id = p_route and customer_id = p_customer;
  if v_id is not null then return v_id; end if;
  select coalesce(max(planned_position), 0) + 1 into v_position from public.commercial_visits where route_id = p_route;
  insert into public.commercial_visits (organization_id, seller_id, customer_id, visit_date, route_id, planned_position)
    values (p_org, auth.uid(), p_customer, v_route.route_date, p_route, v_position) returning id into v_id;
  return v_id;
end $$;

create or replace function public.commercial_visit_add(p_org uuid, p_customer uuid, p_day date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_route uuid; v_id uuid;
begin
  select id into v_route from public.commercial_routes where organization_id = p_org and seller_id = auth.uid()
    and route_date = p_day and route_number = 1;
  if v_route is null then v_route := public.commercial_route_create(p_org, p_day); end if;
  select id into v_id from public.commercial_visits where route_id = v_route and customer_id = p_customer;
  if v_id is not null then return v_id; end if;
  return public.commercial_route_add_visit(p_org, v_route, p_customer);
end $$;

create or replace function public.commercial_route_reorder(p_org uuid, p_route uuid, p_visits uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_route public.commercial_routes%rowtype; v_expected integer;
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  select * into v_route from public.commercial_routes where id = p_route and organization_id = p_org and seller_id = auth.uid() for update;
  if not found or v_route.status <> 'open' then raise exception 'Ruta cerrada o no disponible' using errcode = '22023'; end if;
  select count(*) into v_expected from public.commercial_visits where route_id = p_route;
  if p_visits is null or cardinality(p_visits) <> v_expected or
    (select count(distinct id) from unnest(p_visits) id) <> v_expected or
    exists (select 1 from unnest(p_visits) id where not exists
      (select 1 from public.commercial_visits v where v.route_id = p_route and v.id = id)) then
    raise exception 'La lista de visitas no coincide con la ruta' using errcode = '22023';
  end if;
  -- Avoid transient unique position conflicts while assigning the new sequence.
  update public.commercial_visits set planned_position = planned_position + v_expected where route_id = p_route;
  update public.commercial_visits v set planned_position = ordered.position
    from unnest(p_visits) with ordinality as ordered(id, position)
    where v.id = ordered.id and v.route_id = p_route;
  insert into public.commercial_route_events (route_id, actor_id, action, details)
    values (p_route, auth.uid(), 'reordered', jsonb_build_object('order',
      (select jsonb_agg(jsonb_build_object('visitId', v.id, 'customerId', v.customer_id,
        'position', v.planned_position) order by v.planned_position)
        from public.commercial_visits v where v.route_id = p_route)));
end $$;

create or replace function public.commercial_route_close(p_org uuid, p_route uuid, p_reasons jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_route public.commercial_routes%rowtype; v_visit record; v_reason text;
begin
  if auth.uid() is null or not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  select * into v_route from public.commercial_routes where id = p_route and organization_id = p_org and seller_id = auth.uid() for update;
  if not found or v_route.status <> 'open' then raise exception 'Ruta cerrada o no disponible' using errcode = '22023'; end if;
  if p_reasons is null or jsonb_typeof(p_reasons) <> 'object' then
    raise exception 'Ingresá los motivos de los clientes no visitados' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_reasons) key where not exists
    (select 1 from public.commercial_visits v where v.route_id = p_route and v.checked_in_at is null and v.id::text = key)) then
    raise exception 'Motivos inválidos para esta ruta' using errcode = '22023';
  end if;
  for v_visit in select id from public.commercial_visits where route_id = p_route and checked_in_at is null loop
    v_reason := btrim(p_reasons->>v_visit.id::text);
    if v_reason is null or length(v_reason) < 1 or length(v_reason) > 1000 then
      raise exception 'Cada cliente pendiente requiere un motivo (máximo 1000 caracteres)' using errcode = '22023';
    end if;
    update public.commercial_visits set skip_reason = v_reason where id = v_visit.id;
  end loop;
  update public.commercial_routes set status = 'closed', closed_at = now() where id = p_route;
  insert into public.commercial_route_events (route_id, actor_id, action, details)
    values (p_route, auth.uid(), 'closed', jsonb_build_object('notVisited',
      coalesce((select jsonb_agg(jsonb_build_object('visitId', v.id, 'customerId', v.customer_id,
        'customerName', coalesce(c.fantasy_name, c.business_name), 'reason', v.skip_reason)
        order by v.planned_position)
        from public.commercial_visits v join public.customers c on c.id = v.customer_id
        where v.route_id = p_route and v.checked_in_at is null), '[]'::jsonb)));
end $$;

create or replace function public.commercial_route_reopen(p_org uuid, p_route uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_route public.commercial_routes%rowtype;
begin
  if auth.uid() is null then raise exception 'Sin permiso' using errcode = '42501'; end if;
  select * into v_route from public.commercial_routes where id = p_route and organization_id = p_org for update;
  if not found or v_route.status <> 'closed' then raise exception 'Ruta no cerrada' using errcode = '22023'; end if;
  if v_route.seller_id <> auth.uid() and not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso para reabrir esta ruta' using errcode = '42501';
  end if;
  if v_route.seller_id = auth.uid() and not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para reabrir rutas' using errcode = '42501';
  end if;
  update public.commercial_routes set status = 'open', closed_at = null where id = p_route;
  update public.commercial_visits set skip_reason = null where route_id = p_route and checked_in_at is null;
  insert into public.commercial_route_events (route_id, actor_id, action) values (p_route, auth.uid(), 'reopened');
end $$;

create or replace function public.commercial_visit_correct(p_org uuid, p_visit uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_visit public.commercial_visits%rowtype;
begin
  if auth.uid() is null then raise exception 'Sin permiso' using errcode = '42501'; end if;
  select * into v_visit from public.commercial_visits where id = p_visit and organization_id = p_org for update;
  if not found or v_visit.checked_in_at is null or v_visit.corrected_at is not null then
    raise exception 'Visita no disponible para corrección' using errcode = '22023';
  end if;
  if v_visit.seller_id <> auth.uid() and not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso para corregir' using errcode = '42501';
  end if;
  if v_visit.seller_id = auth.uid() and not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso para corregir visitas' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 1 or length(p_reason) > 1000 then
    raise exception 'Indicá por qué fue un registro equivocado' using errcode = '22023';
  end if;
  update public.commercial_visits set corrected_at = now(), corrected_by = auth.uid(), correction_reason = btrim(p_reason)
    where id = p_visit;
  insert into public.commercial_route_events (route_id, actor_id, action, details)
    values (v_visit.route_id, auth.uid(), 'corrected', jsonb_build_object('visitId', p_visit, 'reason', btrim(p_reason)));
end $$;

-- Keep the GPS check-in implementation from migration 10000; only guard its state
-- through a trigger. Lock route first in the wrapper to serialize with closure.
create or replace function public.commercial_route_checkin_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if old.checked_in_at is null and new.checked_in_at is not null then
    select status into v_status from public.commercial_routes where id = old.route_id for update;
    if v_status <> 'open' then raise exception 'Reabrí la ruta antes de registrar la llegada' using errcode = '22023'; end if;
  end if;
  if old.checked_in_at is not null and (new.checked_in_at is distinct from old.checked_in_at or
    new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude or
    new.accuracy_m is distinct from old.accuracy_m or new.checkin_method is distinct from old.checkin_method) then
    raise exception 'La evidencia de la visita no se puede modificar' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger commercial_route_checkin_guard before update on public.commercial_visits
  for each row execute function public.commercial_route_checkin_guard();

create or replace function public.commercial_route_day(p_org uuid, p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not (public.user_has_org_permission('sales.manage', p_org) or
    public.user_has_org_permission('sales.manage.all', p_org) or public.user_has_org_permission('organization.admin', p_org)) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if p_day < current_date - 30 or p_day > current_date + 7 then raise exception 'Fecha fuera de rango' using errcode = '22023'; end if;
  return jsonb_build_object(
    'routes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'number', r.route_number, 'status', r.status, 'closedAt', r.closed_at,
      'visits', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'customerId', v.customer_id, 'customerName', coalesce(c.fantasy_name, c.business_name),
        'plannedPosition', v.planned_position, 'checkedInAt', v.checked_in_at, 'method', v.checkin_method,
        'reviewStatus', v.review_status, 'hasLocation', l.approved_at is not null,
        'skipReason', v.skip_reason, 'correctedAt', v.corrected_at, 'correctionReason', v.correction_reason)
        order by v.planned_position) from public.commercial_visits v
        join public.customers c on c.id = v.customer_id
        left join public.commercial_customer_locations l on l.customer_id = c.id and l.organization_id = p_org
        where v.route_id = r.id), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'actorId', e.actor_id,
        'createdAt', e.created_at, 'details', e.details) order by e.id)
        from public.commercial_route_events e where e.route_id = r.id), '[]'::jsonb)) order by r.route_number)
      from public.commercial_routes r where r.organization_id = p_org and r.seller_id = v_user and r.route_date = p_day), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', coalesce(c.fantasy_name, c.business_name)) order by c.business_name)
      from public.customers c where c.organization_id = p_org and c.is_active
      and (c.assigned_seller_id is null or c.assigned_seller_id = v_user)), '[]'::jsonb)
  );
end $$;

revoke all on function public.commercial_route_create(uuid,date), public.commercial_route_add_visit(uuid,uuid,uuid),
  public.commercial_route_reorder(uuid,uuid,uuid[]), public.commercial_route_close(uuid,uuid,jsonb),
  public.commercial_route_reopen(uuid,uuid), public.commercial_visit_correct(uuid,uuid,text), public.commercial_route_day(uuid,date)
  from public, anon;
grant execute on function public.commercial_route_create(uuid,date), public.commercial_route_add_visit(uuid,uuid,uuid),
  public.commercial_route_reorder(uuid,uuid,uuid[]), public.commercial_route_close(uuid,uuid,jsonb),
  public.commercial_route_reopen(uuid,uuid), public.commercial_visit_correct(uuid,uuid,text), public.commercial_route_day(uuid,date)
  to authenticated;

create or replace function public.commercial_route_admin_list(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_org_permission('organization.admin', p_org) then
    raise exception 'Sin permiso de supervisión' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'sellerId', r.seller_id,
    'sellerName', coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, r.seller_id::text),
    'day', r.route_date, 'number', r.route_number, 'status', r.status)
    order by r.route_date desc, r.seller_id, r.route_number)
    from public.commercial_routes r left join auth.users u on u.id = r.seller_id
    where r.organization_id = p_org and r.route_date >= current_date - 30), '[]'::jsonb);
end $$;
revoke all on function public.commercial_route_admin_list(uuid) from public, anon;
grant execute on function public.commercial_route_admin_list(uuid) to authenticated;
