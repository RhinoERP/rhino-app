alter type public.invoice_type add value if not exists 'FACTURA_A_RETENCION';

alter table public.organization_arca_settings
add column if not exists invoice_a_authorization_type text not null default 'standard';

alter table public.organization_arca_settings
drop constraint if exists organization_arca_settings_invoice_a_authorization_type_check;

alter table public.organization_arca_settings
add constraint organization_arca_settings_invoice_a_authorization_type_check
check (
  invoice_a_authorization_type in (
    'standard',
    'operation_subject_to_withholding'
  )
);
