-- Customer advances are fiscal documents in their own right.  They are kept
-- separate from the operational sale so an authorized invoice is never reused.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS sales_advances_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'STANDARD',
  ADD CONSTRAINT sales_orders_document_type_check
    CHECK (document_type IN ('STANDARD', 'ADVANCE'));

CREATE TABLE IF NOT EXISTS public.sales_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  final_sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  advance_sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  advance_receivable_id uuid REFERENCES public.accounts_receivable(id) ON DELETE RESTRICT,
  credit_note_id uuid REFERENCES public.credit_notes(id) ON DELETE RESTRICT,
  customer_credit_id uuid REFERENCES public.customer_credits(id) ON DELETE RESTRICT,
  final_receivable_id uuid REFERENCES public.accounts_receivable(id) ON DELETE RESTRICT,
  settlement_payment_id uuid REFERENCES public.receivable_payments(id) ON DELETE RESTRICT,
  percentage_snapshot numeric(7, 4),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'ARS',
  status text NOT NULL DEFAULT 'PENDING_ISSUANCE'
    CHECK (status IN (
      'PENDING_ISSUANCE', 'INVOICED', 'PAID', 'SETTLEMENT_PENDING',
      'SETTLEMENT_IN_PROGRESS', 'SETTLED', 'ISSUANCE_ERROR', 'SETTLEMENT_ERROR'
    )),
  invoiced_at timestamptz,
  paid_at timestamptz,
  settlement_started_at timestamptz,
  settled_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_advances_final_sale_unique
  ON public.sales_advances(final_sales_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_advances_advance_sale_unique
  ON public.sales_advances(advance_sales_order_id) WHERE advance_sales_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_advances_credit_note_unique
  ON public.sales_advances(credit_note_id) WHERE credit_note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_advances_org_status_idx
  ON public.sales_advances(organization_id, status);
CREATE INDEX IF NOT EXISTS sales_orders_document_type_idx
  ON public.sales_orders(organization_id, document_type);

CREATE OR REPLACE FUNCTION public.reject_advance_operational_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.document_type = 'ADVANCE'
    AND (NEW.remittance_number IS NOT NULL OR NEW.status IN ('DISPATCH', 'DELIVERED')) THEN
    RAISE EXCEPTION 'Las ventas documentales de anticipo no pueden despacharse ni generar remito';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_advance_operational_transition ON public.sales_orders;
CREATE TRIGGER reject_advance_operational_transition
  BEFORE INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.reject_advance_operational_transition();

ALTER TABLE public.sales_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_advances organization members can read"
  ON public.sales_advances FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = sales_advances.organization_id
      AND om.user_id = auth.uid()
  ));

CREATE POLICY "sales_advances organization members can write"
  ON public.sales_advances FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = sales_advances.organization_id
      AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = sales_advances.organization_id
      AND om.user_id = auth.uid()
  ));

-- The existing relation is nullable for legacy rows.  New advance settlement
-- applications always populate it from the server-side flow.
CREATE INDEX IF NOT EXISTS customer_credit_applications_credit_idx
  ON public.customer_credit_applications(customer_credit_id)
  WHERE customer_credit_id IS NOT NULL;
