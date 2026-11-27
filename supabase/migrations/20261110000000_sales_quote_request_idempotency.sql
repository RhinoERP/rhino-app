create table if not exists public.sales_quote_request_idempotency (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  payload_hash text not null,
  request_id uuid not null references public.sales_quote_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, seller_user_id, idempotency_key),
  unique (request_id)
);

alter table public.sales_quote_requests
  add column if not exists offline_snapshot_id uuid,
  add column if not exists offline_snapshot_generated_at timestamptz,
  add column if not exists offline_snapshot_expires_at timestamptz,
  add column if not exists offline_snapshot_was_expired boolean not null default false,
  add column if not exists offline_cost_snapshot_incomplete boolean not null default false;

alter table public.sales_quote_request_idempotency enable row level security;
revoke all on public.sales_quote_request_idempotency from public, anon, authenticated;
grant all on public.sales_quote_request_idempotency to service_role;

create or replace function public.create_sales_quote_request_idempotent(
  p_idempotency_key uuid,
  p_request jsonb,
  p_items jsonb
)
returns table(request_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid := nullif(p_request->>'organization_id', '')::uuid;
  v_seller_id uuid := nullif(p_request->>'created_by', '')::uuid;
  v_payload_hash text;
  v_existing public.sales_quote_request_idempotency%rowtype;
  v_request_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación de servidor requerida';
  end if;
  if p_idempotency_key is null or v_org_id is null or v_seller_id is null then
    raise exception 'Clave idempotente o identidad inválida';
  end if;

  v_payload_hash := encode(digest(jsonb_build_object(
    'request', p_request - 'offline_snapshot_was_expired' - 'offline_cost_snapshot_incomplete',
    'items', p_items
  )::text, 'sha256'), 'hex');

  -- Serialize duplicate submissions for the same actor/org/key.
  perform pg_advisory_xact_lock(hashtextextended(
    v_org_id::text || ':' || v_seller_id::text || ':' || p_idempotency_key::text,
    0
  ));

  select * into v_existing
  from public.sales_quote_request_idempotency i
  where i.organization_id = v_org_id
    and i.seller_user_id = v_seller_id
    and i.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.payload_hash <> v_payload_hash then
      raise exception 'OFFLINE_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_existing.request_id, true;
    return;
  end if;

  v_request_id := public.create_sales_quote_request(p_request, p_items);
  update public.sales_quote_requests
  set offline_snapshot_id = nullif(p_request->>'offline_snapshot_id', '')::uuid,
      offline_snapshot_generated_at = nullif(p_request->>'offline_snapshot_generated_at', '')::timestamptz,
      offline_snapshot_expires_at = nullif(p_request->>'offline_snapshot_expires_at', '')::timestamptz,
      offline_snapshot_was_expired = coalesce((p_request->>'offline_snapshot_was_expired')::boolean, false),
      offline_cost_snapshot_incomplete = coalesce((p_request->>'offline_cost_snapshot_incomplete')::boolean, false)
  where id = v_request_id;
  insert into public.sales_quote_request_idempotency (
    organization_id, seller_user_id, idempotency_key, payload_hash, request_id
  ) values (
    v_org_id, v_seller_id, p_idempotency_key, v_payload_hash, v_request_id
  );

  return query select v_request_id, false;
end;
$$;

revoke all on function public.create_sales_quote_request_idempotent(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_sales_quote_request_idempotent(uuid, jsonb, jsonb)
  to service_role;
