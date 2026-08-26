-- Link multiple order_dispatch_events under a single remito so several
-- sub-pedidos of the same parent can be dispatched together.
ALTER TABLE order_dispatch_events
  ADD COLUMN IF NOT EXISTS dispatch_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_dispatch_events_group
  ON order_dispatch_events(dispatch_group_id);
