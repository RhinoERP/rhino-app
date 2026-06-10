-- Orders Integration: INCOMPLETE enum, sales_order_id, order_items

-- 1. INCOMPLETE para diferenciar ventas de pedidos vs. preventas regulares
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'INCOMPLETE';

-- 2. sales_order_id en orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sales_order_id UUID REFERENCES sales_orders(id);
CREATE INDEX IF NOT EXISTS idx_orders_sales_order ON orders(sales_order_id);

-- 3. order_items (base sin split)
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sale_order_item_id UUID NOT NULL REFERENCES sales_order_items(id),
  product_id UUID NOT NULL REFERENCES products(id),
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  item_status order_flow_status NOT NULL DEFAULT 'PENDING_STOCK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sale_item ON order_items(sale_order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(item_status);

-- 4. Trigger updated_at para order_items
DO $$ BEGIN
  CREATE TRIGGER update_order_items_updated_at
    BEFORE UPDATE ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY order_items_org_member_access ON order_items
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM orders
        JOIN organization_members ON organization_members.organization_id = orders.organization_id
        WHERE orders.id = order_items.order_id
          AND organization_members.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
