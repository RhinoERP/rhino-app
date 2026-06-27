alter table public.credit_notes
add column if not exists arca_status text not null default 'not_requested',
add column if not exists arca_cae text,
add column if not exists arca_cae_expires_at timestamptz,
add column if not exists arca_authorized_at timestamptz,
add column if not exists arca_point_of_sale integer,
add column if not exists arca_voucher_number integer,
add column if not exists arca_voucher_type_code integer,
add column if not exists arca_last_error text,
add column if not exists arca_request_json jsonb,
add column if not exists arca_response_json jsonb,
add column if not exists arca_associated_voucher_type_code integer,
add column if not exists arca_associated_point_of_sale integer,
add column if not exists arca_associated_voucher_number integer,
add column if not exists arca_associated_voucher_date date;

alter table public.credit_notes
drop constraint if exists credit_notes_arca_status_check;

alter table public.credit_notes
add constraint credit_notes_arca_status_check
check (
  arca_status in (
    'not_requested',
    'pending',
    'authorized',
    'error'
  )
);

create index if not exists credit_notes_arca_status_idx
on public.credit_notes(organization_id, arca_status);

create unique index if not exists credit_notes_arca_voucher_unique_idx
on public.credit_notes(organization_id, arca_point_of_sale, arca_voucher_type_code, arca_voucher_number)
where arca_point_of_sale is not null
  and arca_voucher_type_code is not null
  and arca_voucher_number is not null;
