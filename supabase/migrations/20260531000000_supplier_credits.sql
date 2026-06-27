-- Migration: Supplier-differentiated credits for intermediary organizations
-- Adds supplier_id to customer_credits and a per-organization toggle

-- 1. Add supplier_id to customer_credits
ALTER TABLE customer_credits
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- 2. Index for filtered credit queries
CREATE INDEX IF NOT EXISTS idx_customer_credits_supplier
  ON customer_credits(customer_id, supplier_id)
  WHERE supplier_id IS NOT NULL AND remaining_amount > 0;

-- 3. Per-organization toggle (follows wholesale_enabled / pos_enabled pattern)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS supplier_differentiated_credits BOOLEAN NOT NULL DEFAULT FALSE;
