-- Orders Module: enum, tables, indices, triggers, RLS, permissions

-- 1. Enum
DO $$ BEGIN
  CREATE TYPE order_flow_status AS ENUM (
    'PENDING_FINANCE',
    'FINANCE_REJECTED',
    'PENDING_STOCK',
    'STOCK_OK',
    'PURCHASE_REQUIRED',
    'PURCHASING',
    'GOODS_RECEIVED',
    'IN_PRODUCTION',
    'DESIGN_REVIEW',
    'PREPARING',
    'DISPATCHED',
    'DELIVERED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tabla orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES quotes(id),
  order_number TEXT NOT NULL,
  status order_flow_status NOT NULL DEFAULT 'PENDING_FINANCE',
  -- Finance
  finance_notes TEXT,
  finance_reviewed_by UUID REFERENCES auth.users(id),
  finance_reviewed_at TIMESTAMPTZ,
  -- Stock
  stock_notes TEXT,
  stock_checked_by UUID REFERENCES auth.users(id),
  stock_checked_at TIMESTAMPTZ,
  purchase_order_id UUID,
  -- Production
  production_notes TEXT,
  production_started_at TIMESTAMPTZ,
  design_approved_at TIMESTAMPTZ,
  -- Dispatch
  dispatch_notes TEXT,
  tracking_number TEXT,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(organization_id, order_number)
);

-- 3. Tabla order_status_history
CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_flow_status,
  to_status order_flow_status NOT NULL,
  notes TEXT,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla order_designs
CREATE TABLE IF NOT EXISTS order_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  products JSONB NOT NULL DEFAULT '[]',
  general_notes TEXT,
  client_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_orders_org ON orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_orders_quote ON orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_designs_order ON order_designs(order_id);

-- 6. Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_order_designs_updated_at
    BEFORE UPDATE ON order_designs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_designs ENABLE ROW LEVEL SECURITY;

-- RLS policies for orders
DO $$ BEGIN
  CREATE POLICY orders_org_member_access ON orders
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_members.organization_id = orders.organization_id
          AND organization_members.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS policies for order_status_history
DO $$ BEGIN
  CREATE POLICY order_status_history_org_member_access ON order_status_history
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM orders
        JOIN organization_members ON organization_members.organization_id = orders.organization_id
        WHERE orders.id = order_status_history.order_id
          AND organization_members.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS policies for order_designs
DO $$ BEGIN
  CREATE POLICY order_designs_org_member_access ON order_designs
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM orders
        JOIN organization_members ON organization_members.organization_id = orders.organization_id
        WHERE orders.id = order_designs.order_id
          AND organization_members.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Permisos RBAC
INSERT INTO permissions (name, description) VALUES
  ('orders.read', 'Ver listado de pedidos y estados'),
  ('orders.write', 'Crear y modificar pedidos'),
  ('orders.finance_review', 'Aprobar/rechazar pedidos en finanzas'),
  ('orders.stock_review', 'Verificar stock de pedidos en compras'),
  ('orders.production', 'Gestionar producción y diseño de pedidos'),
  ('orders.dispatch', 'Gestionar despacho y entrega de pedidos')
ON CONFLICT (name) DO NOTHING;
