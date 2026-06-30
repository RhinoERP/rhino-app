alter table public.sales_orders
add column if not exists accounting_informal_entry_id uuid;