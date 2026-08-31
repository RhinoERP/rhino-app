-- Multimoneda: conversión de pagos al tipo de cambio actual.
--
-- La deuda (cuenta por cobrar / por pagar) queda en su moneda (USD o ARS).
-- Al registrar un pago contra una deuda USD, el operador ingresa el monto en
-- USD y el sistema convierte a ARS con la cotización del momento. El pago
-- guarda:
--   - amount: el monto en la moneda de la deuda (descuenta el saldo tal cual)
--   - currency: la moneda de la deuda ('ARS' para pagos históricos / ARS)
--   - exchange_rate: la cotización usada (NULL para ARS)
--   - amount_ars: el equivalente en ARS del dinero realmente recibido/pagado
--     (amount × exchange_rate para USD; igual a amount para ARS)

-- 1) Pagos de clientes (cobranzas)
ALTER TABLE public.receivable_payments
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE public.receivable_payments
  ADD COLUMN IF NOT EXISTS exchange_rate numeric;

ALTER TABLE public.receivable_payments
  ADD COLUMN IF NOT EXISTS amount_ars numeric;

-- 2) Pagos a proveedores (pagos / órdenes de pago)
ALTER TABLE public.payable_payments
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE public.payable_payments
  ADD COLUMN IF NOT EXISTS exchange_rate numeric;

ALTER TABLE public.payable_payments
  ADD COLUMN IF NOT EXISTS amount_ars numeric;