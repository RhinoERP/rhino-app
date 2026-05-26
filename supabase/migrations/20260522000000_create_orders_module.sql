-- Módulo Estado de Pedidos
-- Tablas: orders, order_status_history, order_designs

-- Tipo de estado del pedido
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

-- Tabla principal de pedidos
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
  -- Purchase reference (links to existing purchase_orders table)
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
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(organization_id, order_number)
);

-- Historial de estados (auditoría)
CREATE TABLE order_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_flow_status,
  to_status order_flow_status NOT NULL,
  notes TEXT,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Datos del boceto de producción/diseño
CREATE TABLE order_designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  products JSONB NOT NULL DEFAULT '[]',
  general_notes TEXT,
  client_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Índices
CREATE INDEX idx_orders_org ON orders(organization_id);
CREATE INDEX idx_orders_quote ON orders(quote_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);
CREATE INDEX idx_order_designs_order ON order_designs(order_id);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER order_designs_updated_at
  BEFORE UPDATE ON order_designs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: habilitar para todas las tablas
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_designs ENABLE ROW LEVEL SECURITY;

-- Políticas: miembros de la organización tienen acceso completo
CREATE POLICY "org_members_orders" ON orders
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_order_status_history" ON order_status_history
  FOR ALL USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "org_members_order_designs" ON order_designs
  FOR ALL USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Permisos para nuevos módulos (pedidos, produccion, despacho)
INSERT INTO permissions (name, description) VALUES
  ('orders.read', 'Ver listado de pedidos y estados'),
  ('orders.write', 'Crear y modificar pedidos'),
  ('orders.finance_review', 'Aprobar/rechazar pedidos en finanzas'),
  ('orders.stock_review', 'Verificar stock de pedidos en compras'),
  ('orders.production', 'Gestionar producción y diseño de pedidos'),
  ('orders.dispatch', 'Gestionar despacho y entrega de pedidos')
ON CONFLICT (name) DO NOTHING;
