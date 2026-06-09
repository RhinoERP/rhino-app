-- ============================================================
-- Add variant_stocks JSONB column to purchase_order_items
-- ============================================================

alter table public.purchase_order_items
  add column if not exists variant_stocks jsonb;
