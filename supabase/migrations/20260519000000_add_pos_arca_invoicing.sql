alter table public.pos_sales
add column if not exists arca_status text not null default 'not_requested',
add column if not exists arca_last_error text,
add column if not exists arca_request_json jsonb,
add column if not exists arca_response_json jsonb,
add column if not exists arca_authorized_at timestamptz,
add column if not exists arca_requested_at timestamptz,
add column if not exists arca_point_of_sale integer,
add column if not exists arca_voucher_number integer,
add column if not exists arca_voucher_type_code integer;

alter table public.pos_sales
drop constraint if exists pos_sales_arca_status_check;

alter table public.pos_sales
add constraint pos_sales_arca_status_check
check (
  arca_status in (
    'not_requested',
    'pending',
    'authorized',
    'error'
  )
);

create table if not exists public.pos_sale_taxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pos_sale_id uuid not null references public.pos_sales(id) on delete cascade,
  tax_id uuid references public.taxes(id) on delete set null,
  name text not null,
  rate numeric not null default 0,
  base_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  tax_code_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_sale_taxes_organization_id_idx
on public.pos_sale_taxes(organization_id);

create index if not exists pos_sale_taxes_pos_sale_id_idx
on public.pos_sale_taxes(pos_sale_id);

create index if not exists pos_sales_arca_status_idx
on public.pos_sales(organization_id, arca_status);

create unique index if not exists pos_sales_arca_voucher_unique_idx
on public.pos_sales(organization_id, arca_point_of_sale, arca_voucher_type_code, arca_voucher_number)
where arca_point_of_sale is not null
  and arca_voucher_type_code is not null
  and arca_voucher_number is not null;
