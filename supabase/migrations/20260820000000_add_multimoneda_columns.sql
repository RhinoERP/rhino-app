-- Multimoneda
-- La moneda y la cotización viajan intactas desde el presupuesto hasta la
-- venta (sales_orders) y la cuenta por cobrar (accounts_receivable), en lugar
-- de aplanarse a ARS al convertir el presupuesto.

-- 1) La venta congela el tipo de cambio del presupuesto (solo para USD).
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS exchange_rate numeric;

-- 2) Moneda por línea de venta (ARS por defecto para ventas históricas).
ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

-- 3) La cuenta por cobrar se genera en la moneda de la venta (USD o ARS).
ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';
