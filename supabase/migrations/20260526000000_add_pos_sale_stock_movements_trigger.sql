alter type public.stock_movement_type add value if not exists 'POS_SALE';

alter table public.stock_movements
add column if not exists pos_sale_item_id uuid;

do $$
begin
  alter table public.stock_movements
  add constraint stock_movements_pos_sale_item_id_fkey
  foreign key (pos_sale_item_id)
  references public.pos_sale_items(id)
  on delete cascade;
exception
  when duplicate_object then null;
end $$;

create unique index if not exists stock_movements_pos_sale_item_id_idx
on public.stock_movements(pos_sale_item_id)
where pos_sale_item_id is not null;

drop trigger if exists record_pos_sale_item_stock_movement_trigger
on public.pos_sale_items;

drop function if exists public.record_pos_sale_item_stock_movement();
