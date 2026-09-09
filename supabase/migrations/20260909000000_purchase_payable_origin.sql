-- A purchase order can represent a purchase note (which creates a payable
-- immediately) or wait for supplier invoices to define its final payable.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payable_origin text NOT NULL DEFAULT 'PURCHASE_NOTE';

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_payable_origin_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_payable_origin_check
  CHECK (payable_origin IN ('PURCHASE_NOTE', 'SUPPLIER_INVOICE'));

-- Credits created when a provisional note payable is reconciled with a lower
-- supplier invoice need a durable, idempotent origin.
ALTER TABLE public.supplier_credits
  ADD COLUMN IF NOT EXISTS source_purchase_order_id uuid
  REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_credits_invoice_reconciliation_po_unique
  ON public.supplier_credits(source_purchase_order_id)
  WHERE source_purchase_order_id IS NOT NULL;

-- Supplier invoices linked to an OC always use the OC currency. This avoids
-- creating a payable that cannot be paid in the same currency as its OC.
CREATE OR REPLACE FUNCTION public.inherit_supplier_invoice_currency_from_purchase_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.purchase_order_id IS NOT NULL THEN
    SELECT currency INTO NEW.currency
    FROM public.purchase_orders
    WHERE id = NEW.purchase_order_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_supplier_invoice_currency_from_purchase_order
  ON public.supplier_invoices;
CREATE TRIGGER inherit_supplier_invoice_currency_from_purchase_order
  BEFORE INSERT OR UPDATE OF purchase_order_id ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.inherit_supplier_invoice_currency_from_purchase_order();

CREATE OR REPLACE FUNCTION public.reconcile_purchase_payable_from_invoices(
  p_purchase_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.purchase_orders%ROWTYPE;
  v_payable public.accounts_payable%ROWTYPE;
  v_credit public.supplier_credits%ROWTYPE;
  v_invoice_count integer := 0;
  v_invoice_total numeric := 0;
  v_due_date date;
  v_invoice_date date;
  v_applied numeric := 0;
  v_pending numeric := 0;
  v_status text := 'PENDING';
  v_overpayment numeric := 0;
  v_credit_used numeric := 0;
  v_credit_remaining numeric := 0;
BEGIN
  SELECT * INTO v_purchase
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    count(*)::integer,
    coalesce(sum(total_amount), 0),
    min(due_date),
    min(invoice_date)
  INTO v_invoice_count, v_invoice_total, v_due_date, v_invoice_date
  FROM public.supplier_invoices
  WHERE purchase_order_id = p_purchase_order_id
    AND status = 'REGISTERED';

  -- An invoice-less "Factura pendiente" does not create a payable. The
  -- cleanup helper below handles explicit restoration to a purchase note.
  IF v_invoice_count = 0 THEN
    RETURN;
  END IF;

  UPDATE public.purchase_orders
  SET payable_origin = 'SUPPLIER_INVOICE', updated_at = now()
  WHERE id = p_purchase_order_id;

  SELECT * INTO v_payable
  FROM public.accounts_payable
  WHERE purchase_order_id = p_purchase_order_id
  FOR UPDATE;

  SELECT * INTO v_credit
  FROM public.supplier_credits
  WHERE source_purchase_order_id = p_purchase_order_id
  FOR UPDATE;

  IF FOUND THEN
    -- A remaining reconciliation credit is money already paid against this
    -- OC but not yet assigned to the payable. Consume it first if a later
    -- invoice raises the consolidated amount.
    v_applied := greatest(0, coalesce(v_payable.total_amount, 0) - coalesce(v_payable.pending_balance, 0))
      + greatest(0, coalesce(v_credit.remaining_amount, 0));
  ELSIF v_payable.id IS NOT NULL THEN
    v_applied := greatest(0, coalesce(v_payable.total_amount, 0) - coalesce(v_payable.pending_balance, 0));
  END IF;

  v_pending := greatest(0, v_invoice_total - v_applied);
  v_status := CASE
    WHEN v_pending <= 0 THEN 'PAID'
    WHEN v_pending < v_invoice_total THEN 'PARTIALLY_PAID'
    ELSE 'PENDING'
  END;

  IF v_payable.id IS NULL THEN
    INSERT INTO public.accounts_payable (
      organization_id, supplier_id, purchase_order_id, total_amount,
      pending_balance, currency, due_date, status
    ) VALUES (
      v_purchase.organization_id, v_purchase.supplier_id, p_purchase_order_id,
      v_invoice_total, v_pending, coalesce(v_purchase.currency, 'ARS'),
      coalesce(v_due_date, v_purchase.expiration_date, v_invoice_date, v_purchase.purchase_date),
      v_status
    );
  ELSE
    UPDATE public.accounts_payable
    SET supplier_id = v_purchase.supplier_id,
        total_amount = v_invoice_total,
        pending_balance = v_pending,
        currency = coalesce(v_purchase.currency, 'ARS'),
        due_date = coalesce(v_due_date, v_purchase.expiration_date, v_invoice_date, v_purchase.purchase_date),
        status = v_status
    WHERE id = v_payable.id;
  END IF;

  v_overpayment := greatest(0, v_applied - v_invoice_total);
  IF v_credit.id IS NULL THEN
    IF v_overpayment > 0 THEN
      INSERT INTO public.supplier_credits (
        organization_id, supplier_id, amount, remaining_amount, currency,
        source_payment_id, source_purchase_order_id, notes
      ) VALUES (
        v_purchase.organization_id, v_purchase.supplier_id, v_overpayment,
        v_overpayment, coalesce(v_purchase.currency, 'ARS'), NULL,
        p_purchase_order_id, 'Crédito generado al conciliar nota de compra con factura'
      );
    END IF;
  ELSE
    v_credit_used := greatest(0, coalesce(v_credit.amount, 0) - coalesce(v_credit.remaining_amount, 0));
    v_credit_remaining := greatest(0, v_overpayment - v_credit_used);
    UPDATE public.supplier_credits
    SET amount = v_credit_used + v_credit_remaining,
        remaining_amount = v_credit_remaining,
        currency = coalesce(v_purchase.currency, 'ARS'),
        updated_at = now()
    WHERE id = v_credit.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_supplier_invoice_payable_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.purchase_order_id IS NOT NULL THEN
      PERFORM public.reconcile_purchase_payable_from_invoices(OLD.purchase_order_id);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.purchase_order_id IS DISTINCT FROM NEW.purchase_order_id
    AND OLD.purchase_order_id IS NOT NULL THEN
    PERFORM public.reconcile_purchase_payable_from_invoices(OLD.purchase_order_id);
  END IF;

  IF NEW.purchase_order_id IS NOT NULL THEN
    PERFORM public.reconcile_purchase_payable_from_invoices(NEW.purchase_order_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reconcile_supplier_invoice_payable ON public.supplier_invoices;
CREATE TRIGGER reconcile_supplier_invoice_payable
  AFTER INSERT OR UPDATE OF purchase_order_id, total_amount, due_date, status
  OR DELETE ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.reconcile_supplier_invoice_payable_trigger();

-- Used only to compensate a failed supplier-invoice upload. It restores the
-- original note behavior after the newly-created invoice is removed.
CREATE OR REPLACE FUNCTION public.restore_purchase_note_payable(
  p_purchase_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.purchase_orders%ROWTYPE;
  v_payable public.accounts_payable%ROWTYPE;
  v_credit public.supplier_credits%ROWTYPE;
  v_applied numeric := 0;
  v_pending numeric := 0;
  v_status text := 'PENDING';
BEGIN
  SELECT * INTO v_purchase FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.purchase_orders
  SET payable_origin = 'PURCHASE_NOTE', updated_at = now()
  WHERE id = p_purchase_order_id;

  SELECT * INTO v_payable FROM public.accounts_payable
  WHERE purchase_order_id = p_purchase_order_id FOR UPDATE;
  SELECT * INTO v_credit FROM public.supplier_credits
  WHERE source_purchase_order_id = p_purchase_order_id FOR UPDATE;

  IF v_payable.id IS NULL THEN
    IF v_purchase.expiration_date IS NULL THEN RETURN; END IF;
    INSERT INTO public.accounts_payable (
      organization_id, supplier_id, purchase_order_id, total_amount,
      pending_balance, currency, due_date, status
    ) VALUES (
      v_purchase.organization_id, v_purchase.supplier_id, p_purchase_order_id,
      v_purchase.total_amount, v_purchase.total_amount,
      coalesce(v_purchase.currency, 'ARS'), v_purchase.expiration_date, 'PENDING'
    );
  ELSE
    v_applied := greatest(0, coalesce(v_payable.total_amount, 0) - coalesce(v_payable.pending_balance, 0))
      + greatest(0, coalesce(v_credit.remaining_amount, 0));
    v_pending := greatest(0, v_purchase.total_amount - v_applied);
    v_status := CASE
      WHEN v_pending <= 0 THEN 'PAID'
      WHEN v_pending < v_purchase.total_amount THEN 'PARTIALLY_PAID'
      ELSE 'PENDING'
    END;
    UPDATE public.accounts_payable
    SET supplier_id = v_purchase.supplier_id,
        total_amount = v_purchase.total_amount,
        pending_balance = v_pending,
        currency = coalesce(v_purchase.currency, 'ARS'),
        due_date = coalesce(v_purchase.expiration_date, v_purchase.purchase_date),
        status = v_status
    WHERE id = v_payable.id;
  END IF;

  IF v_credit.id IS NOT NULL THEN
    DELETE FROM public.supplier_credits
    WHERE id = v_credit.id AND remaining_amount = amount;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_supplier_invoice_payable(
  p_purchase_order_id uuid,
  p_previous_origin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_count integer := 0;
  v_payable_id uuid;
  v_has_payments boolean := false;
BEGIN
  IF p_previous_origin = 'PURCHASE_NOTE' THEN
    PERFORM public.restore_purchase_note_payable(p_purchase_order_id);
    RETURN;
  END IF;

  SELECT count(*)::integer INTO v_invoice_count
  FROM public.supplier_invoices
  WHERE purchase_order_id = p_purchase_order_id
    AND status = 'REGISTERED';

  IF v_invoice_count > 0 THEN
    PERFORM public.reconcile_purchase_payable_from_invoices(p_purchase_order_id);
    RETURN;
  END IF;

  UPDATE public.purchase_orders
  SET payable_origin = 'SUPPLIER_INVOICE', updated_at = now()
  WHERE id = p_purchase_order_id;

  SELECT id INTO v_payable_id
  FROM public.accounts_payable
  WHERE purchase_order_id = p_purchase_order_id
  FOR UPDATE;

  IF v_payable_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payable_payments
    WHERE account_payable_id = v_payable_id
  ) INTO v_has_payments;

  IF NOT v_has_payments THEN
    DELETE FROM public.accounts_payable WHERE id = v_payable_id;
  END IF;
END;
$$;
