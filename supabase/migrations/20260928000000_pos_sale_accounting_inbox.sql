alter table public.pos_sales
drop constraint if exists pos_sales_accounting_status_check;

update public.pos_sales
set accounting_status = 'FORMALIZATION_ERROR'
where accounting_status = 'PARTIALLY_POSTED';

alter table public.pos_sales
add constraint pos_sales_accounting_status_check
check (
  accounting_status in (
    'NOT_REQUIRED',
    'PENDING',
    'REVIEW_REQUIRED',
    'FORMALIZATION_ERROR',
    'POSTED',
    'SETTLED_INFORMAL',
    'ERROR'
  )
);

create index if not exists pos_sales_accounting_inbox_idx
on public.pos_sales (organization_id, sale_date desc)
where accounting_status in (
  'REVIEW_REQUIRED',
  'ERROR',
  'FORMALIZATION_ERROR',
  'PENDING'
);
