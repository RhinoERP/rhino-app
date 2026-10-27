alter table public.purchase_order_items
  add column if not exists discount_percentage numeric not null default 0;

alter table public.purchase_order_items
  drop constraint if exists purchase_order_items_discount_percentage_check;

alter table public.purchase_order_items
  add constraint purchase_order_items_discount_percentage_check
  check (discount_percentage >= 0 and discount_percentage <= 100);
