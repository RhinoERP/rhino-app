-- Payment Cancellation System
-- Adds soft-cancellation support to both receivable and payable payments
-- with full audit trail and credit application tracking.

-- 1. receivable_payments
ALTER TABLE receivable_payments
  ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE receivable_payments
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE receivable_payments
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);

ALTER TABLE receivable_payments
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- 2. payable_payments
ALTER TABLE payable_payments
  ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE payable_payments
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE payable_payments
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);

ALTER TABLE payable_payments
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- 3. FK receivable_payment_id on customer_credit_applications
ALTER TABLE customer_credit_applications
  ADD COLUMN IF NOT EXISTS receivable_payment_id UUID
    REFERENCES receivable_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cca_receivable_payment
  ON customer_credit_applications(receivable_payment_id);

-- 4. New table: supplier_credit_applications
CREATE TABLE IF NOT EXISTS supplier_credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  account_payable_id UUID REFERENCES accounts_payable(id),
  supplier_credit_id UUID REFERENCES supplier_credits(id),
  payable_payment_id UUID,
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sca_payable_payment
  ON supplier_credit_applications(payable_payment_id);

CREATE INDEX IF NOT EXISTS idx_sca_account_payable
  ON supplier_credit_applications(account_payable_id);

-- 5. RLS for supplier_credit_applications
ALTER TABLE supplier_credit_applications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "org members can manage supplier_credit_applications" ON supplier_credit_applications
    FOR ALL
    USING (
      organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
