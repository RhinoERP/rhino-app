-- Anticipo informal en preventas (venta distribuidora, sin ARCA).
--
-- Agrega el porcentaje de anticipo a sales_orders. Se usa exclusivamente para
-- el flujo informal: al crear una preventa con tipo de comprobante NOTA_DE_VENTA
-- se registra el % de anticipo, se crea un documento ADVANCE hijo (sin ARCA)
-- con su propia cuenta por cobrar por ese % y se muestra un aviso en la venta.
-- El flujo formal (ARCA) no se ve afectado.
--
-- La columna queda NULL para ventas sin anticipo o para las convertidas desde
-- presupuestos (que no usan este campo).

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS advance_payment_percentage numeric(5,2)
    CHECK (advance_payment_percentage IS NULL OR advance_payment_percentage BETWEEN 0 AND 100);