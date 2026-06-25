alter table public.sales_orders
add column if not exists tipo_factura text not null default 'MANUAL';

alter table public.sales_orders
drop constraint if exists sales_orders_tipo_factura_check;

alter table public.sales_orders
add constraint sales_orders_tipo_factura_check
check (tipo_factura in ('MANUAL', 'REMITO', 'ANTICIPO'));

create index if not exists idx_sales_orders_tipo_factura
on public.sales_orders (organization_id, tipo_factura);
