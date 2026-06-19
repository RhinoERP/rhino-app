-- Create order_dispatch_events table for tracking partial shipments per child order
CREATE TABLE IF NOT EXISTS order_dispatch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  remito_number TEXT NOT NULL,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_dispatch_events_order ON order_dispatch_events(order_id);

-- RLS: same pattern as order_status_history (uses JOIN via orders → organization_members)
ALTER TABLE order_dispatch_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_dispatch_events_org_member_access ON order_dispatch_events;

CREATE POLICY order_dispatch_events_org_member_access ON order_dispatch_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN organization_members ON organization_members.organization_id = orders.organization_id
      WHERE orders.id = order_dispatch_events.order_id
        AND organization_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      JOIN organization_members ON organization_members.organization_id = orders.organization_id
      WHERE orders.id = order_dispatch_events.order_id
        AND organization_members.user_id = auth.uid()
    )
  );
