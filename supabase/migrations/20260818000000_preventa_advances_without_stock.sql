-- Preventas are operational sales that have not yet consumed stock.  Fiscal
-- advance and balance documents remain separate sales_orders so the existing
-- ARCA integration can authorize them without turning them into deliveries.

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS preventa_status text,
  ADD COLUMN IF NOT EXISTS parent_sales_order_id uuid
    REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS commercial_snapshot jsonb;

ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_preventa_status_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_preventa_status_check CHECK (
    preventa_status IS NULL OR preventa_status IN (
      'BORRADOR', 'ENVIADA', 'APROBADA', 'CON_ANTICIPO',
      'EN_PRODUCCION', 'LISTA_PARA_CONVERTIR',
      'CONVERTIDA_A_VENTA', 'CANCELADA'
    )
  );

ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_document_type_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_document_type_check
    CHECK (document_type IN ('STANDARD', 'ADVANCE', 'BALANCE'));

CREATE INDEX IF NOT EXISTS sales_orders_preventa_status_idx
  ON public.sales_orders (organization_id, preventa_status)
  WHERE preventa_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_orders_parent_sales_order_idx
  ON public.sales_orders (parent_sales_order_id)
  WHERE parent_sales_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_one_balance_document_per_sale
  ON public.sales_orders (parent_sales_order_id)
  WHERE document_type = 'BALANCE';

ALTER TABLE public.sales_advances
  ADD COLUMN IF NOT EXISTS origin_type text NOT NULL DEFAULT 'SALE',
  ADD COLUMN IF NOT EXISTS preventa_sales_order_id uuid
    REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS commercial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS applied_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

ALTER TABLE public.sales_advances
  DROP CONSTRAINT IF EXISTS sales_advances_status_check;
ALTER TABLE public.sales_advances
  ADD CONSTRAINT sales_advances_status_check CHECK (status IN (
    'DRAFT', 'ISSUE_SUBMITTED', 'INVOICED', 'PAID', 'APPLIED', 'VOIDED',
    'CLOSING', 'FINAL_INVOICED', 'CREDIT_NOTE_SUBMITTED', 'CREDIT_AVAILABLE',
    'CREDIT_APPLIED', 'SETTLED', 'RECONCILIATION_REQUIRED',
    'FAILED_RECOVERABLE', 'PENDING_ISSUANCE', 'SETTLEMENT_PENDING',
    'SETTLEMENT_IN_PROGRESS', 'ISSUANCE_ERROR', 'SETTLEMENT_ERROR'
  ));

ALTER TABLE public.sales_advances
  DROP CONSTRAINT IF EXISTS sales_advances_origin_type_check;
ALTER TABLE public.sales_advances
  ADD CONSTRAINT sales_advances_origin_type_check
    CHECK (origin_type IN ('SALE', 'PREVENTA'));
ALTER TABLE public.sales_advances
  DROP CONSTRAINT IF EXISTS sales_advances_applied_amount_check;
ALTER TABLE public.sales_advances
  ADD CONSTRAINT sales_advances_applied_amount_check
    CHECK (applied_amount >= 0 AND applied_amount <= amount);

-- Existing rows retain their original SALE origin.  New preventa records can
-- coexist, so the historical one-advance-per-sale restriction is removed.
DROP INDEX IF EXISTS public.sales_advances_final_sale_unique;
CREATE UNIQUE INDEX IF NOT EXISTS sales_advances_legacy_sale_unique
  ON public.sales_advances(final_sales_order_id)
  WHERE origin_type = 'SALE';
CREATE INDEX IF NOT EXISTS sales_advances_preventa_idx
  ON public.sales_advances (preventa_sales_order_id)
  WHERE preventa_sales_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sales_advance_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  sales_advance_id uuid NOT NULL REFERENCES public.sales_advances(id) ON DELETE RESTRICT,
  balance_sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sales_advance_id, balance_sales_order_id)
);
CREATE INDEX IF NOT EXISTS sales_advance_applications_balance_idx
  ON public.sales_advance_applications(balance_sales_order_id);

ALTER TABLE public.sales_advance_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales advance applications authorized managers"
  ON public.sales_advance_applications FOR ALL
  USING (public.can_manage_sales_advance(organization_id))
  WITH CHECK (public.can_manage_sales_advance(organization_id));

-- The parent row lock makes concurrent advance creation deterministic and
-- prevents the sum of live advances from exceeding the commercial agreement.
CREATE OR REPLACE FUNCTION public.enforce_preventa_advance_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(14,2);
  v_existing numeric(14,2);
BEGIN
  IF NEW.origin_type <> 'PREVENTA' THEN
    RETURN NEW;
  END IF;
  IF NEW.preventa_sales_order_id IS NULL THEN
    RAISE EXCEPTION 'El anticipo de preventa requiere su preventa de origen';
  END IF;
  SELECT total_amount INTO v_total FROM public.sales_orders
    WHERE id = NEW.preventa_sales_order_id
      AND organization_id = NEW.organization_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preventa de origen no encontrada';
  END IF;
  SELECT COALESCE(sum(amount), 0) INTO v_existing
    FROM public.sales_advances
    WHERE preventa_sales_order_id = NEW.preventa_sales_order_id
      AND id IS DISTINCT FROM NEW.id
      AND status NOT IN ('VOIDED', 'SETTLED');
  IF round(v_existing + NEW.amount, 2) > round(v_total, 2) THEN
    RAISE EXCEPTION 'Los anticipos superan el total comprometido de la preventa';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_preventa_advance_capacity ON public.sales_advances;
CREATE TRIGGER enforce_preventa_advance_capacity
  BEFORE INSERT OR UPDATE OF amount, preventa_sales_order_id, origin_type, status
  ON public.sales_advances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_preventa_advance_capacity();

-- Fiscal documents may never become operational documents, even if a caller
-- bypasses application validation.
CREATE OR REPLACE FUNCTION public.reject_fiscal_only_operational_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.document_type IN ('ADVANCE', 'BALANCE')
    AND (NEW.remittance_number IS NOT NULL OR NEW.remittance_pdf_url IS NOT NULL
      OR NEW.status IN ('DISPATCH', 'DELIVERED')) THEN
    RAISE EXCEPTION 'Los documentos fiscales de anticipo o saldo no pueden reservar, despachar, entregar ni generar remitos';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reject_advance_operational_transition ON public.sales_orders;
CREATE TRIGGER reject_advance_operational_transition
  BEFORE INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.reject_fiscal_only_operational_transition();

CREATE OR REPLACE FUNCTION public.reject_fiscal_only_product_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_document_type text;
BEGIN
  SELECT document_type INTO v_document_type FROM public.sales_orders WHERE id = NEW.sales_order_id;
  IF v_document_type IN ('ADVANCE', 'BALANCE')
    AND (NEW.product_id IS NOT NULL OR NEW.product_variant_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Los documentos fiscales de anticipo o saldo no pueden contener productos ni variantes';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reject_advance_product_items ON public.sales_order_items;
CREATE TRIGGER reject_advance_product_items
  BEFORE INSERT OR UPDATE ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.reject_fiscal_only_product_items();

-- Once a fiscal advance exists, commercial fields and lines become immutable.
CREATE OR REPLACE FUNCTION public.lock_invoiced_preventa_commercial_data()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sales_advances sa
    WHERE sa.preventa_sales_order_id = OLD.id
      AND sa.status IN ('ISSUE_SUBMITTED', 'INVOICED', 'PAID', 'APPLIED')
  ) AND (
    NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.sub_total IS DISTINCT FROM OLD.sub_total OR
    NEW.total_tax_amount IS DISTINCT FROM OLD.total_tax_amount OR
    NEW.invoice_type IS DISTINCT FROM OLD.invoice_type OR
    NEW.global_discount_amount IS DISTINCT FROM OLD.global_discount_amount OR
    NEW.global_discount_percentage IS DISTINCT FROM OLD.global_discount_percentage
  ) THEN
    RAISE EXCEPTION 'La preventa tiene anticipos facturados y sus datos comerciales no pueden modificarse';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lock_invoiced_preventa_commercial_data ON public.sales_orders;
CREATE TRIGGER lock_invoiced_preventa_commercial_data
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.lock_invoiced_preventa_commercial_data();

CREATE OR REPLACE FUNCTION public.lock_invoiced_preventa_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_preventa_id uuid;
BEGIN
  v_preventa_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.sales_order_id
    ELSE NEW.sales_order_id
  END;
  IF EXISTS (
    SELECT 1 FROM public.sales_advances sa
    WHERE sa.preventa_sales_order_id = v_preventa_id
      AND sa.status IN ('ISSUE_SUBMITTED', 'INVOICED', 'PAID', 'APPLIED')
  ) THEN
    RAISE EXCEPTION 'La preventa tiene anticipos facturados y sus ítems no pueden modificarse';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lock_invoiced_preventa_items ON public.sales_order_items;
CREATE TRIGGER lock_invoiced_preventa_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.lock_invoiced_preventa_items();
