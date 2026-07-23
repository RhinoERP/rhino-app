alter table public.sales_order_items
  add column quote_item_id uuid references public.quote_items(id) on delete set null;
