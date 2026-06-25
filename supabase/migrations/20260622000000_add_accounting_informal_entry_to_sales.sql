-- ============================================================
-- 20260622000000_add_accounting_informal_entry_to_sales.sql
-- Agrega referencia al asiento informal en sales_orders
-- ============================================================

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS accounting_informal_entry_id UUID;
