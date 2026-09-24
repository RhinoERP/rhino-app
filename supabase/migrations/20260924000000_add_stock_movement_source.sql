alter table public.stock_movements
add column if not exists source text not null default 'SYSTEM';

alter table public.stock_movements
drop constraint if exists stock_movements_source_check;

alter table public.stock_movements
add constraint stock_movements_source_check check (
  source in (
    'MANUAL',
    'IMPORT',
    'PURCHASE',
    'SALE',
    'POS',
    'ORDER',
    'RETURN',
    'SYSTEM'
  )
);

comment on column public.stock_movements.source is
  'Structured origin of the stock change. Existing and unspecified movements default to SYSTEM.';
