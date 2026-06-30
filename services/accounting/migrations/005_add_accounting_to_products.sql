-- Campo contable en productos (schema public, no accounting)
-- Sin FK dura hacia accounting para no acoplar schemas
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS accounting_account_code TEXT;

COMMENT ON COLUMN public.products.accounting_account_code IS
  'Código semántico de la cuenta contable del plan de cuentas '
  '(accounting.chart_of_accounts.account_code). '
  'Usado por el motor de asientos en facturas contra remito.';

CREATE INDEX IF NOT EXISTS idx_products_accounting_code
  ON public.products(accounting_account_code)
  WHERE accounting_account_code IS NOT NULL;
