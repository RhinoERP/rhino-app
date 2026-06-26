alter table public.credit_notes
add column if not exists origin_type text not null default 'MANUAL_ADJUSTMENT',
add column if not exists reason text,
add column if not exists purchase_target_credit_id uuid;

alter table public.credit_notes
drop constraint if exists credit_notes_origin_type_check;

alter table public.credit_notes
add constraint credit_notes_origin_type_check
check (
  origin_type in (
    'RETURN',
    'PURCHASE_TARGET',
    'MANUAL_ADJUSTMENT',
    'OTHER'
  )
);

create table if not exists public.credit_note_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  credit_note_id uuid not null references public.credit_notes(id) on delete cascade,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  sales_order_item_id uuid references public.sales_order_items(id) on delete set null,
  sales_return_item_id uuid references public.sales_return_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric not null default 0,
  unit_price numeric not null default 0,
  discount_amount numeric not null default 0,
  net_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_note_items_credit_note_idx
on public.credit_note_items(credit_note_id);

create index if not exists credit_note_items_sales_return_item_idx
on public.credit_note_items(sales_return_item_id)
where sales_return_item_id is not null;

create table if not exists public.credit_note_taxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  credit_note_id uuid not null references public.credit_notes(id) on delete cascade,
  tax_id uuid references public.taxes(id) on delete set null,
  name text not null,
  rate numeric not null default 0,
  base_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  tax_code_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_note_taxes_credit_note_idx
on public.credit_note_taxes(credit_note_id);

create table if not exists public.credit_note_source_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  credit_note_id uuid not null references public.credit_notes(id) on delete cascade,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  applied_amount numeric not null default 0,
  invoice_type public.invoice_type,
  invoice_number text,
  arca_status text,
  arca_point_of_sale integer,
  arca_voucher_number integer,
  arca_voucher_type_code integer,
  arca_voucher_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_note_source_documents_credit_note_idx
on public.credit_note_source_documents(credit_note_id);

create index if not exists credit_note_source_documents_sales_order_idx
on public.credit_note_source_documents(sales_order_id)
where sales_order_id is not null;

create table if not exists public.purchase_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  threshold_amount numeric not null default 0,
  benefit_type text not null,
  benefit_value numeric not null default 0,
  status text not null default 'DRAFT',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_targets_benefit_type_check
    check (benefit_type in ('percentage', 'fixed_amount')),
  constraint purchase_targets_status_check
    check (status in ('DRAFT', 'CONFIRMED', 'CANCELLED')),
  constraint purchase_targets_period_check
    check (period_end >= period_start)
);

create index if not exists purchase_targets_customer_period_idx
on public.purchase_targets(organization_id, customer_id, period_start, period_end);

create table if not exists public.purchase_target_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_target_id uuid not null references public.purchase_targets(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  credit_note_id uuid references public.credit_notes(id) on delete set null,
  eligible_sales_total numeric not null default 0,
  credit_amount numeric not null default 0,
  selected_sales_order_ids uuid[] not null default '{}',
  status text not null default 'CONFIRMED',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_target_credits_status_check
    check (status in ('CONFIRMED', 'CANCELLED'))
);

create index if not exists purchase_target_credits_customer_idx
on public.purchase_target_credits(organization_id, customer_id);

alter table public.credit_notes
drop constraint if exists credit_notes_purchase_target_credit_id_fkey;

alter table public.credit_notes
add constraint credit_notes_purchase_target_credit_id_fkey
foreign key (purchase_target_credit_id)
references public.purchase_target_credits(id)
on delete set null;

create index if not exists credit_notes_origin_type_idx
on public.credit_notes(organization_id, origin_type);

create index if not exists credit_notes_purchase_target_credit_idx
on public.credit_notes(purchase_target_credit_id)
where purchase_target_credit_id is not null;
