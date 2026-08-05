-- A final-sale receivable is an accounting record, but it must not be
-- collectable while an advance is still the customer's visible obligation.
ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS is_collection_deferred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deferred_by_sales_advance_id uuid;

ALTER TABLE public.accounts_receivable
  DROP CONSTRAINT IF EXISTS accounts_receivable_deferred_by_sales_advance_id_fkey;
ALTER TABLE public.accounts_receivable
  ADD CONSTRAINT accounts_receivable_deferred_by_sales_advance_id_fkey
  FOREIGN KEY (deferred_by_sales_advance_id)
  REFERENCES public.sales_advances(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS accounts_receivable_visible_collection_idx
  ON public.accounts_receivable (organization_id, due_date)
  WHERE is_collection_deferred = false;
CREATE INDEX IF NOT EXISTS accounts_receivable_deferred_advance_idx
  ON public.accounts_receivable (deferred_by_sales_advance_id)
  WHERE is_collection_deferred = true;

-- Backfill only cases that have never received money on the final receivable.
-- Previously-paid cases are deliberately left visible for manual reconciliation.
WITH candidates AS (
  SELECT sa.id, sa.final_receivable_id,
    EXISTS (
      SELECT 1 FROM public.receivable_payments rp
      WHERE rp.account_receivable_id = sa.final_receivable_id
    ) AS has_final_payment
  FROM public.sales_advances sa
  WHERE sa.final_receivable_id IS NOT NULL
    AND sa.status NOT IN ('SETTLED', 'RECONCILIATION_REQUIRED')
)
UPDATE public.accounts_receivable ar
SET is_collection_deferred = true,
    deferred_by_sales_advance_id = candidates.id
FROM candidates
WHERE ar.id = candidates.final_receivable_id
  AND candidates.has_final_payment = false;

UPDATE public.sales_advances sa
SET status = 'RECONCILIATION_REQUIRED',
    last_error = COALESCE(sa.last_error || E'\n', '') ||
      'La cuenta final ya tenía pagos al migrar el diferimiento; requiere conciliación manual.',
    updated_at = now()
WHERE sa.final_receivable_id IS NOT NULL
  AND sa.status NOT IN ('SETTLED', 'RECONCILIATION_REQUIRED')
  AND EXISTS (
    SELECT 1 FROM public.receivable_payments rp
    WHERE rp.account_receivable_id = sa.final_receivable_id
  );

CREATE OR REPLACE FUNCTION public.enforce_sales_advance_receivable_deferred()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_advance_id uuid;
BEGIN
  SELECT sa.id INTO v_advance_id
  FROM public.sales_advances sa
  WHERE sa.final_sales_order_id = NEW.sales_order_id
    AND sa.status NOT IN ('SETTLED', 'RECONCILIATION_REQUIRED')
  LIMIT 1;

  IF v_advance_id IS NOT NULL
    AND current_setting('app.sales_advance_settlement', true) IS DISTINCT FROM 'on' THEN
    NEW.is_collection_deferred := true;
    NEW.deferred_by_sales_advance_id := v_advance_id;
  ELSIF TG_OP = 'UPDATE'
    AND OLD.is_collection_deferred
    AND current_setting('app.sales_advance_settlement', true) IS DISTINCT FROM 'on' THEN
    -- A deferred final account can only be made collectible by the settlement RPC.
    NEW.is_collection_deferred := true;
    NEW.deferred_by_sales_advance_id := OLD.deferred_by_sales_advance_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_sales_advance_receivable_deferred ON public.accounts_receivable;
CREATE TRIGGER enforce_sales_advance_receivable_deferred
  BEFORE INSERT OR UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_advance_receivable_deferred();

CREATE OR REPLACE FUNCTION public.reject_deferred_receivable_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.accounts_receivable ar
    WHERE ar.id = NEW.account_receivable_id
      AND ar.is_collection_deferred
  ) THEN
    RAISE EXCEPTION 'La cuenta final está diferida por un anticipo y no admite pagos directos';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_deferred_receivable_payment ON public.receivable_payments;
CREATE TRIGGER reject_deferred_receivable_payment
  BEFORE INSERT OR UPDATE ON public.receivable_payments
  FOR EACH ROW EXECUTE FUNCTION public.reject_deferred_receivable_payment();

CREATE OR REPLACE FUNCTION public.reject_deferred_credit_application()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.sales_advance_settlement', true) IS DISTINCT FROM 'on'
    AND EXISTS (
      SELECT 1 FROM public.accounts_receivable ar
      WHERE ar.id = NEW.account_receivable_id
        AND ar.is_collection_deferred
    ) THEN
    RAISE EXCEPTION 'La cuenta final diferida sólo admite la aplicación dirigida del anticipo';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_deferred_credit_application ON public.customer_credit_applications;
CREATE TRIGGER reject_deferred_credit_application
  BEFORE INSERT OR UPDATE ON public.customer_credit_applications
  FOR EACH ROW EXECUTE FUNCTION public.reject_deferred_credit_application();

-- Locks the final sale and its receivable before the advance document is built.
-- It is idempotent and also protects concurrent normal collection requests.
CREATE OR REPLACE FUNCTION public.defer_sales_advance_final_receivable(p_advance_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advance public.sales_advances%ROWTYPE;
  v_receivable public.accounts_receivable%ROWTYPE;
BEGIN
  SELECT * INTO v_advance FROM public.sales_advances WHERE id = p_advance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anticipo no encontrado'; END IF;
  IF NOT public.can_manage_sales_advance(v_advance.organization_id) THEN
    RAISE EXCEPTION 'No tenés permisos para gestionar anticipos';
  END IF;

  PERFORM 1 FROM public.sales_orders WHERE id = v_advance.final_sales_order_id FOR UPDATE;
  SELECT * INTO v_receivable FROM public.accounts_receivable
    WHERE sales_order_id = v_advance.final_sales_order_id
      AND organization_id = v_advance.organization_id
    FOR UPDATE;

  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM public.receivable_payments rp WHERE rp.account_receivable_id = v_receivable.id) THEN
      RAISE EXCEPTION 'La venta final ya tiene pagos registrados; resolvé la conciliación manualmente antes de crear un anticipo';
    END IF;
    UPDATE public.accounts_receivable
    SET is_collection_deferred = true, deferred_by_sales_advance_id = v_advance.id
    WHERE id = v_receivable.id;
    UPDATE public.sales_advances SET final_receivable_id = v_receivable.id, updated_at = now()
    WHERE id = v_advance.id;
    RETURN v_receivable.id;
  END IF;
  RETURN NULL;
END;
$$;

-- The only path that makes the final receivable visible. All monetary and
-- non-monetary state changes happen in one transaction.
CREATE OR REPLACE FUNCTION public.apply_sales_advance_credit(p_advance_id uuid)
RETURNS TABLE (application_id uuid, applied_amount numeric, pending_balance numeric, advance_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advance public.sales_advances%ROWTYPE;
  v_credit public.customer_credits%ROWTYPE;
  v_receivable public.accounts_receivable%ROWTYPE;
  v_application_id uuid;
  v_amount numeric(14,2);
  v_next_pending numeric(14,2);
BEGIN
  SELECT * INTO v_advance FROM public.sales_advances WHERE id = p_advance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anticipo no encontrado'; END IF;
  IF NOT public.can_manage_sales_advance(v_advance.organization_id) THEN
    RAISE EXCEPTION 'No tenés permisos para aplicar créditos de anticipos';
  END IF;
  IF v_advance.credit_application_id IS NOT NULL THEN
    SELECT amount INTO v_amount FROM public.customer_credit_applications WHERE id = v_advance.credit_application_id;
    SELECT pending_balance INTO v_next_pending FROM public.accounts_receivable WHERE id = v_advance.final_receivable_id;
    RETURN QUERY SELECT v_advance.credit_application_id, v_amount, v_next_pending, v_advance.status;
    RETURN;
  END IF;
  IF v_advance.customer_credit_id IS NULL OR v_advance.final_receivable_id IS NULL OR v_advance.credit_note_id IS NULL THEN
    RAISE EXCEPTION 'El anticipo no tiene crédito, NC o cuenta final listos para aplicar';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_orders
    WHERE id = v_advance.final_sales_order_id AND arca_status = 'authorized'
  ) THEN
    RAISE EXCEPTION 'La factura final debe estar autorizada por ARCA antes de aplicar el anticipo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_notes WHERE id = v_advance.credit_note_id AND arca_status = 'authorized') THEN
    RAISE EXCEPTION 'La nota de crédito del anticipo debe estar autorizada por ARCA';
  END IF;
  SELECT * INTO v_credit FROM public.customer_credits WHERE id = v_advance.customer_credit_id FOR UPDATE;
  SELECT * INTO v_receivable FROM public.accounts_receivable WHERE id = v_advance.final_receivable_id FOR UPDATE;
  IF NOT FOUND OR NOT v_receivable.is_collection_deferred THEN
    RAISE EXCEPTION 'La cuenta final debe permanecer diferida hasta aplicar el anticipo';
  END IF;
  v_amount := LEAST(v_advance.amount, v_credit.remaining_amount, v_receivable.pending_balance);
  IF v_amount <> v_advance.amount THEN RAISE EXCEPTION 'El crédito disponible o el saldo final no coinciden exactamente con el anticipo'; END IF;
  v_next_pending := GREATEST(round(v_receivable.pending_balance - v_amount, 2), 0);
  PERFORM set_config('app.sales_advance_settlement', 'on', true);
  INSERT INTO public.customer_credit_applications (organization_id, customer_id, customer_credit_id, account_receivable_id, amount, payment_date, notes)
  VALUES (v_advance.organization_id, v_credit.customer_id, v_credit.id, v_receivable.id, v_amount, CURRENT_DATE, 'Aplicación de anticipo ' || v_advance.id)
  RETURNING id INTO v_application_id;
  UPDATE public.customer_credits SET remaining_amount = GREATEST(round(v_credit.remaining_amount - v_amount, 2), 0) WHERE id = v_credit.id;
  UPDATE public.accounts_receivable
  SET pending_balance = v_next_pending,
      status = CASE WHEN v_next_pending = 0 THEN 'PAID' WHEN v_next_pending < total_amount THEN 'PARTIALLY_PAID' ELSE 'PENDING' END,
      is_collection_deferred = false,
      deferred_by_sales_advance_id = NULL
  WHERE id = v_receivable.id;
  UPDATE public.sales_advances
  SET credit_application_id = v_application_id,
      status = CASE WHEN v_next_pending = 0 THEN 'SETTLED' ELSE 'CREDIT_APPLIED' END,
      settled_at = CASE WHEN v_next_pending = 0 THEN now() ELSE NULL END,
      updated_at = now(), last_error = NULL
  WHERE id = v_advance.id;
  RETURN QUERY SELECT v_application_id, v_amount, v_next_pending,
    CASE WHEN v_next_pending = 0 THEN 'SETTLED' ELSE 'CREDIT_APPLIED' END;
END;
$$;

REVOKE ALL ON FUNCTION public.defer_sales_advance_final_receivable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.defer_sales_advance_final_receivable(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_sales_advance_final_receivable(p_advance_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  SELECT organization_id INTO v_organization_id FROM public.sales_advances WHERE id = p_advance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anticipo no encontrado'; END IF;
  IF NOT public.can_manage_sales_advance(v_organization_id) THEN
    RAISE EXCEPTION 'No tenés permisos para gestionar anticipos';
  END IF;
  PERFORM set_config('app.sales_advance_settlement', 'on', true);
  UPDATE public.accounts_receivable
  SET is_collection_deferred = false, deferred_by_sales_advance_id = NULL
  WHERE deferred_by_sales_advance_id = p_advance_id;
END;
$$;
REVOKE ALL ON FUNCTION public.release_sales_advance_final_receivable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_sales_advance_final_receivable(uuid) TO authenticated;
