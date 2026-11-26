-- Internal dispatch guard, not a publisher or a complete reconciliation.
BEGIN;

CREATE FUNCTION public.assert_meli_sale_dispatch_capacity(
  p_org_id uuid, p_sale_id uuid, p_kind text, p_origin_id uuid, p_amount numeric,
  p_currency text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invoice_amount numeric;
  v_invoice_currency text;
  v_sale_currency text;
  v_sale_amount numeric;
  v_notes numeric;
  v_payments numeric;
BEGIN
  IF p_org_id IS NULL OR p_sale_id IS NULL OR p_origin_id IS NULL
    OR p_kind IS NULL OR p_kind NOT IN ('creditNote', 'payment')
    OR p_amount IS NULL OR p_amount::text !~ '^[0-9]+(\.[0-9]+)?$'
    OR p_amount <= 0 OR p_amount <> round(p_amount, 2)
    OR p_currency IS NULL OR p_currency NOT IN ('ARS', 'USD') THEN
    RAISE EXCEPTION 'Datos de reserva contable inválidos' USING ERRCODE = '22023';
  END IF;
  SELECT s.currency, s.total_amount INTO v_sale_currency, v_sale_amount
    FROM public.sales_orders s
    WHERE s.organization_id = p_org_id AND s.id = p_sale_id
      AND s.sales_channel = 'MERCADO_LIBRE'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  SELECT (f.source_snapshot->>'amount')::numeric, f.source_snapshot->>'currency'
    INTO v_invoice_amount, v_invoice_currency
    FROM public.mercadolibre_fiscal_accounting_preparations f
    JOIN public.mercadolibre_fiscal_accounting_dispatches d ON d.preparation_id = f.id
    WHERE f.organization_id = p_org_id AND f.sale_id = p_sale_id
      AND f.origin_type = 'invoice' AND f.origin_id = p_sale_id
      AND d.status = 'PUBLISHED';
  IF NOT FOUND OR v_invoice_amount IS NULL
    OR v_invoice_amount::text !~ '^[0-9]+(\.[0-9]+)?$'
    OR v_invoice_amount <= 0
    OR v_invoice_amount <> round(v_invoice_amount, 2)
    OR v_invoice_amount IS DISTINCT FROM v_sale_amount
    OR v_invoice_currency IS DISTINCT FROM v_sale_currency
    OR p_currency IS DISTINCT FROM v_sale_currency
    OR v_sale_currency NOT IN ('ARS', 'USD') OR v_sale_currency IS NULL THEN
    RAISE EXCEPTION 'La factura publicada no coincide con la venta o requiere revisión';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mercadolibre_fiscal_accounting_preparations f
    JOIN public.mercadolibre_fiscal_accounting_dispatches d ON d.preparation_id = f.id
    WHERE f.organization_id = p_org_id AND f.sale_id = p_sale_id
      AND f.origin_type = 'creditNote'
      AND (f.source_snapshot->>'currency' IS DISTINCT FROM v_sale_currency
        OR (f.source_snapshot->>'amount')::numeric IS NULL
        OR f.source_snapshot->>'amount' !~ '^[0-9]+(\.[0-9]+)?$'
        OR (f.source_snapshot->>'amount')::numeric <= 0
        OR (f.source_snapshot->>'amount')::numeric <> round((f.source_snapshot->>'amount')::numeric, 2))
  ) THEN RAISE EXCEPTION 'Una nota despachada requiere revisión'; END IF;
  SELECT coalesce(sum((f.source_snapshot->>'amount')::numeric), 0)
    INTO v_notes FROM public.mercadolibre_fiscal_accounting_preparations f
    JOIN public.mercadolibre_fiscal_accounting_dispatches d ON d.preparation_id = f.id
    WHERE f.organization_id = p_org_id AND f.sale_id = p_sale_id
      AND f.origin_type = 'creditNote';

  IF EXISTS (
    SELECT 1 FROM public.mercadolibre_payments p
    WHERE p.organization_id = p_org_id AND p.sales_order_id = p_sale_id
      AND EXISTS (
        SELECT 1 FROM public.mercadolibre_accounting_payment_preparations a
        JOIN public.mercadolibre_accounting_payment_dispatches d ON d.preparation_id = a.id
        WHERE a.organization_id = p_org_id AND a.payment_id = p.id
      )
      AND (p.currency IS DISTINCT FROM v_sale_currency OR p.amount IS NULL
        OR p.amount::text !~ '^[0-9]+(\.[0-9]+)?$'
        OR p.amount <= 0 OR p.amount <> round(p.amount, 2)
        OR p.status IS NULL OR p.status NOT IN ('RECORDED', 'VOIDED')
        OR (p.status = 'VOIDED' AND NOT EXISTS (
          SELECT 1 FROM public.mercadolibre_payment_reversal_reservations r
          WHERE r.organization_id = p_org_id AND r.payment_id = p.id AND r.status = 'VOIDED'
        )))
  ) THEN RAISE EXCEPTION 'Un cobro despachado requiere revisión'; END IF;
  SELECT coalesce(sum(p.amount), 0) INTO v_payments
    FROM public.mercadolibre_payments p
    WHERE p.organization_id = p_org_id AND p.sales_order_id = p_sale_id
      AND p.status = 'RECORDED'
      AND EXISTS (
        SELECT 1 FROM public.mercadolibre_accounting_payment_preparations a
        JOIN public.mercadolibre_accounting_payment_dispatches d ON d.preparation_id = a.id
        WHERE a.organization_id = p_org_id AND a.payment_id = p.id
      );
  IF p_kind = 'creditNote' THEN
    v_notes := v_notes + p_amount;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.mercadolibre_accounting_payment_preparations a
    JOIN public.mercadolibre_accounting_payment_dispatches d ON d.preparation_id = a.id
    WHERE a.organization_id = p_org_id AND a.payment_id = p_origin_id
  ) THEN
    v_payments := v_payments + p_amount;
  END IF;
  IF v_notes + v_payments > v_invoice_amount THEN
    RAISE EXCEPTION 'Las notas y cobros despachados exceden el total de la factura';
  END IF;
END;
$$;

CREATE FUNCTION public.guard_meli_fiscal_dispatch_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_preparation public.mercadolibre_fiscal_accounting_preparations%ROWTYPE;
BEGIN
  SELECT * INTO v_preparation FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE id = NEW.preparation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación fiscal no encontrada'; END IF;
  IF v_preparation.origin_type = 'creditNote' THEN
    PERFORM public.assert_meli_sale_dispatch_capacity(
      v_preparation.organization_id, v_preparation.sale_id, 'creditNote',
      v_preparation.origin_id, (v_preparation.source_snapshot->>'amount')::numeric,
      v_preparation.source_snapshot->>'currency'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_meli_payment_dispatch_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_payment public.mercadolibre_payments%ROWTYPE;
BEGIN
  SELECT p.* INTO v_payment FROM public.mercadolibre_payments p
    JOIN public.mercadolibre_accounting_payment_preparations a
      ON a.payment_id = p.id AND a.organization_id = p.organization_id
    WHERE a.id = NEW.preparation_id;
  IF NOT FOUND OR v_payment.status IS DISTINCT FROM 'RECORDED' THEN
    RAISE EXCEPTION 'Cobro no vigente para el despacho';
  END IF;
  PERFORM public.assert_meli_sale_dispatch_capacity(
    v_payment.organization_id, v_payment.sales_order_id, 'payment',
    v_payment.id, v_payment.amount, v_payment.currency
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER meli_fiscal_dispatch_capacity_guard
  BEFORE INSERT ON public.mercadolibre_fiscal_accounting_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_fiscal_dispatch_capacity();
CREATE TRIGGER meli_payment_dispatch_capacity_guard
  BEFORE INSERT ON public.mercadolibre_accounting_payment_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_payment_dispatch_capacity();

REVOKE ALL ON FUNCTION public.assert_meli_sale_dispatch_capacity(uuid, uuid, text, uuid, numeric, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_fiscal_dispatch_capacity()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_payment_dispatch_capacity()
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
