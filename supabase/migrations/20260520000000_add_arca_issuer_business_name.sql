alter table public.organization_arca_settings
add column if not exists issuer_business_name text;

alter table public.organization_arca_settings
drop constraint if exists organization_arca_settings_issuer_business_name_length_check;

alter table public.organization_arca_settings
add constraint organization_arca_settings_issuer_business_name_length_check
check (
  issuer_business_name is null
  or char_length(issuer_business_name) <= 140
);
