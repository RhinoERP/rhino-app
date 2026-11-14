-- Orders Integration: sales_order_id, parent_order_id, assigned_order_id

-- 1. sales_order_id en orders (vinculación con venta)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sales_order_id UUID REFERENCES sales_orders(id);
CREATE INDEX IF NOT EXISTS idx_orders_sales_order ON orders(sales_order_id);

-- 2. parent_order_id en orders (relación padre → hijos, nullable)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES orders(id);
CREATE INDEX IF NOT EXISTS idx_orders_parent ON orders(parent_order_id);

-- 3. assigned_order_id en quote_items (a qué child pertenece cada item, nullable)
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS assigned_order_id UUID REFERENCES orders(id);
CREATE INDEX IF NOT EXISTS idx_quote_items_assigned_order ON quote_items(assigned_order_id);

-- 4. nuevo valor INCOMPLETE para el estado intermedio (finanzas aprobó, stock aún no)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'INCOMPLETE'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status')
  ) THEN
    ALTER TYPE order_status ADD VALUE 'INCOMPLETE';
  END IF;
END $$;
