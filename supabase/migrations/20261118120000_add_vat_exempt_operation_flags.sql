ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS is_vat_exempt boolean NOT NULL DEFAULT false;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS is_vat_exempt boolean NOT NULL DEFAULT false;
