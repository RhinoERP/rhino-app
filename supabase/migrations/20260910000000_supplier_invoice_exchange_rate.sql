-- MM-7: freeze the exchange rate captured at supplier-invoice entry so the
-- FACTURA_COMPRA accounting event can carry moneda/tipoCambio/montoUSD and
-- Finanzas can convert pending payable balances to ARS.

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(14, 4) NULL;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(14, 4) NULL;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS amount_ars numeric(14, 2) NULL;

-- Reconcile the payable from the linked supplier invoices. The payable keeps
-- its currency (inherited from the purchase order); amount_ars is the ARS
-- valuation accumulated per invoice (each one converted with its own frozen
-- rate, ARS invoices use rate 1). exchange_rate stays nullable as reference.
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
  v_invoice_ars numeric := 0;
  v_due_date date;
  v_invoice_date date;
  v_applied numeric := 0;
  v_pending numeric := 0;
  v_status text := 'PENDING';
  v_overpayment numeric := 0;
  v_credit_used numeric := 0;
  v_credit_remaining numeric := 0;
  v_credit_exists boolean := false;
  v_currency text;
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
    coalesce(sum(total_amount * coalesce(exchange_rate, 1)), 0),
    min(due_date),
    min(invoice_date)
  INTO v_invoice_count, v_invoice_total, v_invoice_ars, v_due_date, v_invoice_date
  FROM public.supplier_invoices
  WHERE purchase_order_id = p_purchase_order_id
    AND status = 'REGISTERED';

  v_currency := coalesce(v_purchase.currency, 'ARS');

  -- An invoice-less "Factura pendiente" does not create a payable. If the
  -- last linked invoice is removed or cancelled, remove the outstanding
  -- payable too; payments already made remain represented by a paid record
  -- and become supplier credit instead of leaving a phantom debt.
  IF v_invoice_count = 0 THEN
    UPDATE public.purchase_orders
    SET payable_origin = 'SUPPLIER_INVOICE', updated_at = now()
    WHERE id = p_purchase_order_id;

    SELECT * INTO v_payable
    FROM public.accounts_payable
    WHERE purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF v_payable.id IS NULL THEN
      RETURN;
    END IF;

    SELECT * INTO v_credit
    FROM public.supplier_credits
    WHERE source_purchase_order_id = p_purchase_order_id
    FOR UPDATE;
    v_credit_exists := FOUND;

    v_applied := greatest(
      0,
      coalesce(v_payable.total_amount, 0) - coalesce(v_payable.pending_balance, 0)
    );

    IF v_applied = 0 THEN
      DELETE FROM public.accounts_payable WHERE id = v_payable.id;
      RETURN;
    END IF;

    -- Keep the payable only as a paid audit record because payments reference
    -- it. Its outstanding balance is zero, so it no longer appears as debt.
    UPDATE public.accounts_payable
    SET total_amount = v_applied,
        pending_balance = 0,
        status = 'PAID'
    WHERE id = v_payable.id;

    IF v_credit_exists THEN
      v_credit_used := greatest(0, coalesce(v_credit.amount, 0) - coalesce(v_credit.remaining_amount, 0));
      v_credit_remaining := v_applied + greatest(0, coalesce(v_credit.remaining_amount, 0));
      UPDATE public.supplier_credits
      SET amount = v_credit_used + v_credit_remaining,
          remaining_amount = v_credit_remaining,
          currency = v_currency,
          updated_at = now()
      WHERE id = v_credit.id;
    ELSE
      INSERT INTO public.supplier_credits (
        organization_id, supplier_id, amount, remaining_amount, currency,
        source_payment_id, source_purchase_order_id, notes
      ) VALUES (
        v_purchase.organization_id, v_purchase.supplier_id, v_applied,
        v_applied, v_currency, NULL,
        p_purchase_order_id, 'Crédito generado al eliminar la última factura vinculada'
      );
    END IF;

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
      pending_balance, currency, due_date, status, amount_ars
    ) VALUES (
      v_purchase.organization_id, v_purchase.supplier_id, p_purchase_order_id,
      v_invoice_total, v_pending, v_currency,
      coalesce(v_due_date, v_purchase.expiration_date, v_invoice_date, v_purchase.purchase_date),
      v_status, v_invoice_ars
    );
  ELSE
    UPDATE public.accounts_payable
    SET supplier_id = v_purchase.supplier_id,
        total_amount = v_invoice_total,
        pending_balance = v_pending,
        currency = v_currency,
        due_date = coalesce(v_due_date, v_purchase.expiration_date, v_invoice_date, v_purchase.purchase_date),
        status = v_status,
        amount_ars = v_invoice_ars
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
        v_overpayment, v_currency, NULL,
        p_purchase_order_id, 'Crédito generado al conciliar nota de compra con factura'
      );
    END IF;
  ELSE
    v_credit_used := greatest(0, coalesce(v_credit.amount, 0) - coalesce(v_credit.remaining_amount, 0));
    v_credit_remaining := greatest(0, v_overpayment - v_credit_used);
    UPDATE public.supplier_credits
    SET amount = v_credit_used + v_credit_remaining,
        remaining_amount = v_credit_remaining,
        currency = v_currency,
        updated_at = now()
    WHERE id = v_credit.id;
  END IF;
END;
$$;

-- Restore the purchase-note behavior after a failed supplier-invoice upload.
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
  v_currency text;
BEGIN
  SELECT * INTO v_purchase FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_currency := coalesce(v_purchase.currency, 'ARS');

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
      pending_balance, currency, due_date, status, amount_ars
    ) VALUES (
      v_purchase.organization_id, v_purchase.supplier_id, p_purchase_order_id,
      v_purchase.total_amount, v_purchase.total_amount,
      v_currency, v_purchase.expiration_date, 'PENDING',
      CASE WHEN v_currency = 'ARS' THEN truncate(v_purchase.total_amount) ELSE NULL END
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
        currency = v_currency,
        due_date = coalesce(v_purchase.expiration_date, v_purchase.purchase_date),
        status = v_status,
        amount_ars = CASE WHEN v_currency = 'ARS' THEN truncate(v_purchase.total_amount) ELSE NULL END
    WHERE id = v_payable.id;
  END IF;

  IF v_credit.id IS NOT NULL THEN
    DELETE FROM public.supplier_credits
    WHERE id = v_credit.id AND remaining_amount = amount;
  END IF;
END;
$$;