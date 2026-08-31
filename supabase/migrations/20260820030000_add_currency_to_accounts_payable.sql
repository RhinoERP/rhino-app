-- Multimoneda: las cuentas por pagar (deudas a proveedores) se generan en la
-- moneda de la orden de compra (USD o ARS), igual que las cuentas por cobrar.
ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';
