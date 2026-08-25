ALTER TABLE order_dispatch_events
  ADD COLUMN IF NOT EXISTS package_count INTEGER;

ALTER TABLE order_dispatch_events
  ADD COLUMN IF NOT EXISTS declared_value NUMERIC;
