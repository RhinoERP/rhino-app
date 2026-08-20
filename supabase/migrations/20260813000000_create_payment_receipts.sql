-- Receipts for customer payments (cobranzas)
alter table public.receivable_payments
  add column if not exists receipt_number text,
  add column if not exists receipt_pdf_url text;

create index if not exists receivable_payments_receipt_number_idx
  on public.receivable_payments (organization_id, receipt_number)
  where receipt_number is not null;

-- Per-organization receipt counter. Managed exclusively through the
-- generate_receipt_number() RPC below (no direct table access for clients).
create table if not exists public.receipt_numbering (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  next_number bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.receipt_numbering enable row level security;

create or replace function public.generate_receipt_number(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.disabled_at is null
  ) then
    raise exception 'No tenés permisos para emitir recibos';
  end if;

  insert into public.receipt_numbering (organization_id, next_number)
  values (p_org_id, 1)
  on conflict (organization_id) do nothing;

  select next_number into v_next
  from public.receipt_numbering
  where organization_id = p_org_id
  for update;

  update public.receipt_numbering
  set next_number = v_next + 1, updated_at = now()
  where organization_id = p_org_id;

  return '1-' || lpad(v_next::text, 10, '0');
end;
$$;

revoke all on function public.generate_receipt_number(uuid) from public;
grant execute on function public.generate_receipt_number(uuid) to authenticated;

-- Read-only peek used for the preview (does not consume a number).
create or replace function public.peek_receipt_number(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select '1-' || lpad(rn.next_number::text, 10, '0')
  from public.receipt_numbering rn
  where rn.organization_id = p_org_id
  union all
  select '1-0000000001'
  where not exists (
    select 1 from public.receipt_numbering where organization_id = p_org_id
  );
$$;

revoke all on function public.peek_receipt_number(uuid) from public;
grant execute on function public.peek_receipt_number(uuid) to authenticated;
