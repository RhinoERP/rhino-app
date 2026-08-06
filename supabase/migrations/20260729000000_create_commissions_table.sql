-- Commissions module toggle
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS commissions_enabled boolean DEFAULT false;

-- Drop old commission columns from sales_orders (moved to new commissions table)
ALTER TABLE sales_orders
  DROP COLUMN IF EXISTS commission_rate,
  DROP COLUMN IF EXISTS commission_amount;

-- Commissions table: one row per payment applied to a sale
-- A single payment can generate multiple commission rows (one per sale covered)
-- A sale paid in installments generates one commission row per payment
CREATE TABLE IF NOT EXISTS commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL,                          -- seller from sales_orders.user_id
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id),
  receivable_payment_id uuid REFERENCES receivable_payments(id),
  sales_price_list_id uuid REFERENCES sales_price_lists(id),
  base_commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  extra_commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL,
  paid_amount numeric(12,2) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_commissions_org_user
  ON commissions(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_commissions_org_created
  ON commissions(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commissions_receivable_payment
  ON commissions(receivable_payment_id)
  WHERE receivable_payment_id IS NOT NULL;
