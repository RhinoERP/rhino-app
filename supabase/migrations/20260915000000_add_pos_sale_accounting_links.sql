alter table public.pos_sales
add column if not exists accounting_sale_entry_id uuid,
add column if not exists accounting_payment_entry_id uuid,
add column if not exists accounting_status text not null default 'NOT_REQUIRED',
add column if not exists accounting_last_error text,
add column if not exists accounting_updated_at timestamptz,
add column if not exists accounting_sale_event_snapshot jsonb,
add column if not exists accounting_payment_event_snapshot jsonb;

alter table public.pos_sales
add constraint pos_sales_accounting_status_check
check (
  accounting_status in (
    'NOT_REQUIRED',
    'PENDING',
    'REVIEW_REQUIRED',
    'PARTIALLY_POSTED',
    'POSTED',
    'SETTLED_INFORMAL',
    'ERROR'
  )
);
