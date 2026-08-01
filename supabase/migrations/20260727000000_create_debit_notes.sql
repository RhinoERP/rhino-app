-- Fiscal debit notes are intentionally separate from credit notes: their
-- financial effect increases, rather than creates credit for, a customer.
create table if not exists public.debit_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  debit_note_number text not null,
  invoice_type public.invoice_type not null,
  reason text not null check (reason in ('INTEREST', 'FREIGHT_OR_POST_CHARGE', 'PRICE_DIFFERENCE', 'OTHER')),
  reason_detail text,
  observations text,
  issue_date date not null default current_date,
  amount numeric not null check (amount > 0),
  status text not null default 'draft' check (status in ('draft', 'pending', 'verifying', 'authorized', 'error')),
  emission_idempotency_key uuid not null default gen_random_uuid(),
  arca_cae text,
  arca_cae_expires_at timestamptz,
  arca_authorized_at timestamptz,
  arca_point_of_sale integer,
  arca_voucher_number integer,
  arca_reserved_voucher_number integer,
  arca_voucher_type_code integer,
  arca_last_error text,
  arca_request_json jsonb,
  arca_response_json jsonb,
  arca_associated_voucher_type_code integer,
  arca_associated_point_of_sale integer,
  arca_associated_voucher_number integer,
  arca_associated_voucher_date date,
  account_receivable_id uuid references public.accounts_receivable(id) on delete restrict,
  financial_applied_at timestamptz,
  invoice_email_status text not null default 'not_sent' check (invoice_email_status in ('not_sent', 'pending', 'sent', 'failed')),
  invoice_email_recipient text,
  invoice_email_sent_at timestamptz,
  invoice_email_last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debit_notes_other_reason_detail_check check (reason <> 'OTHER' or nullif(trim(reason_detail), '') is not null)
);

create unique index if not exists debit_notes_org_number_key
  on public.debit_notes(organization_id, debit_note_number);
create unique index if not exists debit_notes_org_voucher_key
  on public.debit_notes(organization_id, arca_point_of_sale, arca_voucher_type_code, arca_voucher_number)
  where arca_point_of_sale is not null and arca_voucher_type_code is not null and arca_voucher_number is not null;
create index if not exists debit_notes_org_status_idx on public.debit_notes(organization_id, status);
create index if not exists debit_notes_sale_idx on public.debit_notes(sales_order_id);
create index if not exists debit_notes_customer_idx on public.debit_notes(customer_id);

create table if not exists public.debit_note_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  debit_note_id uuid not null references public.debit_notes(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists debit_note_events_note_idx on public.debit_note_events(debit_note_id, created_at);

-- Keep the numeric sequence internal; fiscal voucher numbers remain ARCA-owned.
create or replace function public.generate_debit_note_number(org_id uuid)
returns text
language plpgsql
as $$
declare next_number bigint;
begin
  perform pg_advisory_xact_lock(hashtext(org_id::text || ':debit-notes'));
  select coalesce(max(nullif(regexp_replace(debit_note_number, '\\D', '', 'g'), '')::bigint), 0) + 1
    into next_number
    from public.debit_notes
   where organization_id = org_id;
  return lpad(next_number::text, 8, '0');
end;
$$;

-- This is the only place where authorization and the customer debt are applied.
create or replace function public.finalize_debit_note_authorization(
  p_debit_note_id uuid,
  p_organization_id uuid,
  p_point_of_sale integer,
  p_voucher_type_code integer,
  p_voucher_number integer,
  p_cae text,
  p_cae_expires_at timestamptz,
  p_associated_voucher_type_code integer,
  p_associated_point_of_sale integer,
  p_associated_voucher_number integer,
  p_associated_voucher_date date,
  p_request_json jsonb,
  p_response_json jsonb
)
returns jsonb
language plpgsql
as $$
declare
  note_row public.debit_notes%rowtype;
  receivable_row public.accounts_receivable%rowtype;
  due_days integer;
  next_total numeric;
  next_pending numeric;
  next_status public.receivable_status;
  resolved_receivable_id uuid;
begin
  select * into note_row
    from public.debit_notes
   where id = p_debit_note_id and organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'Nota de débito no encontrada';
  end if;

  if note_row.status = 'authorized' then
    return jsonb_build_object('idempotent', true, 'account_receivable_id', note_row.account_receivable_id);
  end if;

  if note_row.status not in ('pending', 'verifying') then
    raise exception 'La nota de débito no está lista para finalizar su autorización';
  end if;

  select * into receivable_row
    from public.accounts_receivable
   where organization_id = p_organization_id and sales_order_id = note_row.sales_order_id
   for update;

  if found then
    next_total := round(coalesce(receivable_row.total_amount, 0) + note_row.amount, 2);
    next_pending := round(coalesce(receivable_row.pending_balance, 0) + note_row.amount, 2);
    next_status := case
      when next_pending <= 0 then 'PAID'::public.receivable_status
      when next_pending < next_total then 'PARTIALLY_PAID'::public.receivable_status
      else 'PENDING'::public.receivable_status
    end;
    update public.accounts_receivable
       set total_amount = next_total,
           pending_balance = next_pending,
           status = next_status,
           updated_at = now()
     where id = receivable_row.id;
    resolved_receivable_id := receivable_row.id;
  else
    select coalesce(customer_row.due_days, 0) into due_days from public.customers customer_row where customer_row.id = note_row.customer_id;
    insert into public.accounts_receivable (
      organization_id, customer_id, sales_order_id, total_amount, pending_balance, due_date, status, updated_at
    ) values (
      p_organization_id, note_row.customer_id, note_row.sales_order_id,
      note_row.amount, note_row.amount, note_row.issue_date + coalesce(due_days, 0), 'PENDING', now()
    ) returning id into resolved_receivable_id;
  end if;

  update public.debit_notes
     set status = 'authorized',
         arca_cae = p_cae,
         arca_cae_expires_at = p_cae_expires_at,
         arca_authorized_at = now(),
         arca_point_of_sale = p_point_of_sale,
         arca_voucher_type_code = p_voucher_type_code,
         arca_voucher_number = p_voucher_number,
         arca_reserved_voucher_number = p_voucher_number,
         arca_associated_voucher_type_code = p_associated_voucher_type_code,
         arca_associated_point_of_sale = p_associated_point_of_sale,
         arca_associated_voucher_number = p_associated_voucher_number,
         arca_associated_voucher_date = p_associated_voucher_date,
         arca_request_json = p_request_json,
         arca_response_json = p_response_json,
         arca_last_error = null,
         account_receivable_id = resolved_receivable_id,
         financial_applied_at = now(),
         updated_at = now()
   where id = note_row.id;

  insert into public.debit_note_events (organization_id, debit_note_id, event_type, from_status, to_status, actor_id, metadata)
  values (p_organization_id, note_row.id, 'authorized', note_row.status, 'authorized', auth.uid(),
    jsonb_build_object('voucher_number', p_voucher_number, 'cae', p_cae, 'account_receivable_id', resolved_receivable_id));

  return jsonb_build_object('idempotent', false, 'account_receivable_id', resolved_receivable_id);
end;
$$;

alter table public.debit_notes enable row level security;
alter table public.debit_note_events enable row level security;

create policy debit_notes_org_member_access on public.debit_notes
  for all using (exists (
    select 1 from public.organization_members om
    where om.organization_id = debit_notes.organization_id and om.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.organization_members om
    where om.organization_id = debit_notes.organization_id and om.user_id = auth.uid()
  ));

create policy debit_note_events_org_member_access on public.debit_note_events
  for select using (exists (
    select 1 from public.organization_members om
    where om.organization_id = debit_note_events.organization_id and om.user_id = auth.uid()
  ));

insert into public.permissions (key, description)
values
  ('debitnotes.read', 'Ver notas de débito'),
  ('debitnotes.manage', 'Crear, editar y emitir notas de débito')
on conflict (key) do nothing;

-- Existing credit-note readers retain access to the equivalent new section.
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id = rp.permission_id and source.key = 'creditnotes.read'
join public.permissions target on target.key = 'debitnotes.read'
on conflict do nothing;

-- Roles already able to manage sales and view ARCA receive ND management.
insert into public.role_permissions (role_id, permission_id)
select distinct sales_rp.role_id, target.id
from public.role_permissions sales_rp
join public.permissions sales_permission on sales_permission.id = sales_rp.permission_id
join public.role_permissions arca_rp on arca_rp.role_id = sales_rp.role_id
join public.permissions arca_permission on arca_permission.id = arca_rp.permission_id and arca_permission.key = 'arca.read'
join public.permissions target on target.key = 'debitnotes.manage'
where sales_permission.key in ('sales.manage', 'sales.manage.all')
on conflict do nothing;
