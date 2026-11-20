--  Drop redundant columns from orders
ALTER TABLE orders
  DROP COLUMN IF EXISTS finance_notes,
  DROP COLUMN IF EXISTS finance_reviewed_by,
  DROP COLUMN IF EXISTS finance_reviewed_at,
  DROP COLUMN IF EXISTS stock_notes,
  DROP COLUMN IF EXISTS stock_checked_by,
  DROP COLUMN IF EXISTS stock_checked_at,
  DROP COLUMN IF EXISTS production_notes,
  DROP COLUMN IF EXISTS production_started_at,
  DROP COLUMN IF EXISTS design_approved_at,
  DROP COLUMN IF EXISTS dispatch_notes,
  DROP COLUMN IF EXISTS dispatched_at,
  DROP COLUMN IF EXISTS delivered_at;
