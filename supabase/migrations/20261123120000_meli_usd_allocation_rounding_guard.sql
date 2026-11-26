-- Reserve USD allocations under the sale lock and reject cumulative ARS differences.
BEGIN;

CREATE FUNCTION public.assert_meli_usd_allocation_rounding(
  p_org_id uuid, p_sale_id uuid, p_kind text, p_origin_id uuid,
  p_amount numeric, p_currency text, p_payload jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invoice_payload jsonb;
  v_rate numeric;
  v_source numeric := 0;
  v_pesos numeric := 0;
  v_candidate_pesos numeric;
  v_line jsonb;
  v_note record;
  v_payment record;
BEGIN
  IF p_currency IS DISTINCT FROM 'USD' THEN
    RETURN;
  END IF;
  PERFORM 1 FROM public.sales_orders s
    WHERE s.id = p_sale_id AND s.organization_id = p_org_id
      AND s.sales_channel = 'MERCADO_LIBRE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  SELECT d.request_payload INTO v_invoice_payload
    FROM public.mercadolibre_fiscal_accounting_preparations f
    JOIN public.mercadolibre_fiscal_accounting_dispatches d ON d.preparation_id = f.id
    WHERE f.organization_id = p_org_id AND f.sale_id = p_sale_id
      AND f.origin_type = 'invoice' AND f.origin_id = p_sale_id
      AND d.status = 'PUBLISHED';
  IF NOT FOUND OR v_invoice_payload->>'currency' IS DISTINCT FROM 'USD'
    OR coalesce(v_invoice_payload->>'exchangeRate', '') !~ '^(0|[1-9][0-9]{0,5})(\.[0-9]{1,4})?$' THEN
    RAISE EXCEPTION 'La cotización contable de la factura requiere revisión';
  END IF;
  v_rate := (v_invoice_payload->>'exchangeRate')::numeric;
  IF v_rate <= 0 THEN RAISE EXCEPTION 'Cotización de factura inválida'; END IF;
  FOR v_note IN
    SELECT f.source_snapshot, d.request_payload
    FROM public.mercadolibre_fiscal_accounting_preparations f
    JOIN public.mercadolibre_fiscal_accounting_dispatches d ON d.preparation_id = f.id
    WHERE f.organization_id = p_org_id AND f.sale_id = p_sale_id
      AND f.origin_type = 'creditNote'
  LOOP
    IF v_note.source_snapshot->>'currency' IS DISTINCT FROM 'USD'
      OR jsonb_typeof(v_note.request_payload->'lines') IS DISTINCT FROM 'array'
      OR (SELECT count(*) FROM jsonb_array_elements(v_note.request_payload->'lines') l
        WHERE l->>'side' = 'HABER') <> 1 THEN
      RAISE EXCEPTION 'Una nota despachada requiere revisión monetaria';
    END IF;
    SELECT l INTO v_line FROM jsonb_array_elements(v_note.request_payload->'lines') l
      WHERE l->>'side' = 'HABER';
    IF coalesce(v_line->>'pesosAmount', '') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      OR coalesce(v_note.source_snapshot->>'amount', '') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Importes de nota inválidos para conciliación';
    END IF;
    v_source := v_source + (v_note.source_snapshot->>'amount')::numeric;
    v_pesos := v_pesos + (v_line->>'pesosAmount')::numeric;
  END LOOP;
  FOR v_payment IN
    SELECT p.id, p.amount FROM public.mercadolibre_payments p
    WHERE p.organization_id = p_org_id AND p.sales_order_id = p_sale_id
      AND p.status = 'RECORDED'
      AND EXISTS (
        SELECT 1 FROM public.mercadolibre_accounting_payment_preparations a
        JOIN public.mercadolibre_accounting_payment_dispatches d ON d.preparation_id = a.id
        WHERE a.organization_id = p_org_id AND a.payment_id = p.id
      )
  LOOP
    v_source := v_source + v_payment.amount;
    v_pesos := v_pesos + round(v_payment.amount * v_rate, 2);
  END LOOP;
  IF p_kind = 'creditNote' THEN
    IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array'
      OR (SELECT count(*) FROM jsonb_array_elements(p_payload->'lines') l
        WHERE l->>'side' = 'HABER') <> 1 THEN
      RAISE EXCEPTION 'La nota requiere revisión monetaria';
    END IF;
    SELECT l INTO v_line FROM jsonb_array_elements(p_payload->'lines') l
      WHERE l->>'side' = 'HABER';
    IF coalesce(v_line->>'pesosAmount', '') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'El importe de la nota requiere revisión monetaria';
    END IF;
    v_candidate_pesos := (v_line->>'pesosAmount')::numeric;
    v_source := v_source + p_amount;
    v_pesos := v_pesos + v_candidate_pesos;
  ELSIF p_kind = 'payment' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.mercadolibre_accounting_payment_preparations a
      JOIN public.mercadolibre_accounting_payment_dispatches d ON d.preparation_id = a.id
      WHERE a.organization_id = p_org_id AND a.payment_id = p_origin_id
    ) THEN
      v_source := v_source + p_amount;
      v_pesos := v_pesos + round(p_amount * v_rate, 2);
    END IF;
  ELSE
    RAISE EXCEPTION 'Origen de conciliación monetaria inválido';
  END IF;
  IF v_pesos IS DISTINCT FROM round(v_source * v_rate, 2) THEN
    RAISE EXCEPTION 'Los cobros y notas USD no cuadran en pesos; requiere revisión de redondeo o cotización';
  END IF;
END;
$$;

CREATE FUNCTION public.guard_meli_fiscal_dispatch_usd_rounding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_preparation public.mercadolibre_fiscal_accounting_preparations%ROWTYPE;
BEGIN
  SELECT * INTO v_preparation FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE id = NEW.preparation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación fiscal no encontrada'; END IF;
  IF v_preparation.origin_type = 'creditNote' THEN
    PERFORM public.assert_meli_usd_allocation_rounding(
      v_preparation.organization_id, v_preparation.sale_id, 'creditNote',
      v_preparation.origin_id, (v_preparation.source_snapshot->>'amount')::numeric,
      v_preparation.source_snapshot->>'currency', NEW.request_payload);
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_meli_payment_dispatch_usd_rounding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_payment public.mercadolibre_payments%ROWTYPE;
BEGIN
  SELECT p.* INTO v_payment FROM public.mercadolibre_payments p
    JOIN public.mercadolibre_accounting_payment_preparations a
      ON a.payment_id = p.id AND a.organization_id = p.organization_id
    WHERE a.id = NEW.preparation_id;
  IF NOT FOUND OR v_payment.status IS DISTINCT FROM 'RECORDED' THEN
    RAISE EXCEPTION 'Cobro no vigente para el despacho';
  END IF;
  PERFORM public.assert_meli_usd_allocation_rounding(
    v_payment.organization_id, v_payment.sales_order_id, 'payment',
    v_payment.id, v_payment.amount, v_payment.currency, NEW.request_payload);
  RETURN NEW;
END;
$$;

CREATE TRIGGER z_meli_fiscal_dispatch_usd_rounding
  BEFORE INSERT ON public.mercadolibre_fiscal_accounting_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_fiscal_dispatch_usd_rounding();
CREATE TRIGGER z_meli_payment_dispatch_usd_rounding
  BEFORE INSERT ON public.mercadolibre_accounting_payment_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_payment_dispatch_usd_rounding();

REVOKE ALL ON FUNCTION public.assert_meli_usd_allocation_rounding(uuid, uuid, text, uuid, numeric, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_fiscal_dispatch_usd_rounding()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_payment_dispatch_usd_rounding()
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
