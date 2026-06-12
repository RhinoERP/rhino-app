alter table public.organization_arca_settings
add column if not exists issuer_vat_condition text,
add column if not exists issuer_gross_income_number text,
add column if not exists issuer_activity_start_date date;

alter table public.organization_arca_settings
drop constraint if exists organization_arca_settings_issuer_vat_condition_length_check;

alter table public.organization_arca_settings
add constraint organization_arca_settings_issuer_vat_condition_length_check
check (
  issuer_vat_condition is null
  or char_length(issuer_vat_condition) <= 80
);

alter table public.organization_arca_settings
drop constraint if exists organization_arca_settings_issuer_gross_income_number_length_check;

alter table public.organization_arca_settings
add constraint organization_arca_settings_issuer_gross_income_number_length_check
check (
  issuer_gross_income_number is null
  or char_length(issuer_gross_income_number) <= 40
);

alter table public.pos_sales
drop constraint if exists pos_sales_arca_status_check;

alter table public.pos_sales
add constraint pos_sales_arca_status_check
check (
  arca_status in (
    'not_requested',
    'pending',
    'pending_invoicing',
    'authorized',
    'error'
  )
);
