-- Amplía la precisión de las columnas monetarias de presupuestos y ventas
-- convertidas a numeric(14,6) para que el cálculo de conversión de moneda con
-- precisión interna (6 decimales) sobreviva el round-trip guardar→editar.
--
-- Motivo: los presupuestos en USD con productos/extras en ARS convierten los
-- precios con precisión 6 (117.263843) para evitar errores de truncamiento en
-- cantidades grandes. Las columnas numeric(12,2) redondeaban a 2 decimales al
-- persistir, y al editar el form recalculaba con los valores redondeados
-- (total 2751.15 en vez de 2751.14).
--
-- Idempotente: cada columna solo se altera si todavía no tiene precisión 6.
-- Es seguro re-ejecutar esta migración.

DO $$
DECLARE
  column_spec record;
BEGIN
  FOR column_spec IN
    SELECT table_name, column_name
    FROM (
      VALUES
        -- Presupuestos
        ('quote_items', 'unit_price'),
        ('quote_items', 'subtotal'),
        ('quote_items', 'discount_amount'),
        ('quote_item_extras', 'price'),
        ('quote_taxes', 'base_amount'),
        ('quote_taxes', 'tax_amount'),
        ('quote_item_taxes', 'base_amount'),
        ('quote_item_taxes', 'tax_amount'),
        ('quotes', 'sub_total'),
        ('quotes', 'total_tax_amount'),
        ('quotes', 'total_amount'),
        ('quotes', 'global_discount_amount'),
        -- Venta convertida desde presupuesto
        ('sales_order_items', 'unit_price'),
        ('sales_order_items', 'base_price'),
        ('sales_order_items', 'subtotal'),
        ('sales_order_items', 'discount_amount'),
        ('sales_order_item_extras', 'price_snapshot'),
        ('sales_order_item_extras', 'cost_snapshot')
    ) AS specs(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = column_spec.table_name
        AND column_name = column_spec.column_name
        AND (
          data_type <> 'numeric'
          OR COALESCE(numeric_precision, 0) < 14
          OR COALESCE(numeric_scale, 0) < 6
        )
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE numeric(14,6)',
        column_spec.table_name,
        column_spec.column_name
      );
    END IF;
  END LOOP;
END $$;