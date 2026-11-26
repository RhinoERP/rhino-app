-- Durable fiscal source preparation. It does not publish journal entries.
BEGIN;

CREATE TABLE public.mercadolibre_fiscal_accounting_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sale_id uuid NOT NULL REFERENCES public.sales_orders(id),
  origin_type text NOT NULL CHECK (origin_type IN ('invoice', 'creditNote')),
  origin_id uuid NOT NULL,
  request_key uuid NOT NULL,
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, request_key),
  UNIQUE (organization_id, origin_type, origin_id)
);

ALTER TABLE public.mercadolibre_fiscal_accounting_preparations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadolibre_fiscal_accounting_preparations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.prepare_meli_fiscal_accounting(
  p_org_id uuid, p_actor_id uuid, p_sale_id uuid,
  p_origin_type text, p_origin_id uuid, p_request_key uuid
) RETURNS TABLE (preparation_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_sale public.sales_orders%ROWTYPE;
  v_note public.credit_notes%ROWTYPE;
  v_existing public.mercadolibre_fiscal_accounting_preparations%ROWTYPE;
  v_snapshot jsonb;
  v_id uuid;
BEGIN
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_sale_id IS NULL
    OR p_origin_id IS NULL OR p_request_key IS NULL
    OR p_origin_type IS NULL OR p_origin_type NOT IN ('invoice', 'creditNote')
    OR (p_origin_type = 'invoice' AND p_origin_id <> p_sale_id) THEN
    RAISE EXCEPTION 'Datos de preparación fiscal inválidos' USING ERRCODE = '22023';
  END IF;
  v_admin := public.assert_meli_accounting_access(p_org_id, p_actor_id);
  SELECT * INTO v_sale FROM public.sales_orders
    WHERE id = p_sale_id AND organization_id = p_org_id
      AND sales_channel = 'MERCADO_LIBRE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments
      WHERE organization_id = p_org_id AND user_id = p_actor_id
        AND warehouse_id = v_sale.warehouse_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Depósito no asignado al usuario' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_sale.arca_status IS DISTINCT FROM 'authorized'
    OR nullif(btrim(v_sale.arca_cae), '') IS NULL
    OR v_sale.arca_request_json IS NULL
    OR v_sale.currency IS NULL OR v_sale.currency NOT IN ('ARS', 'USD')
    OR v_sale.total_amount IS NULL OR v_sale.total_amount <= 0
    OR v_sale.arca_point_of_sale IS NULL OR v_sale.arca_point_of_sale <= 0
    OR v_sale.arca_voucher_type_code IS NULL OR v_sale.arca_voucher_type_code <= 0
    OR v_sale.arca_voucher_number IS NULL OR v_sale.arca_voucher_number <= 0 THEN
    RAISE EXCEPTION 'La factura no tiene autorización fiscal verificable';
  END IF;

  IF p_origin_type = 'invoice' THEN
    v_snapshot := jsonb_build_object(
      'currency', v_sale.currency, 'amount', v_sale.total_amount::text,
      'status', v_sale.arca_status, 'cae', v_sale.arca_cae,
      'pointOfSale', v_sale.arca_point_of_sale, 'voucherType', v_sale.arca_voucher_type_code,
      'voucherNumber', v_sale.arca_voucher_number, 'request', v_sale.arca_request_json
    );
  ELSE
    SELECT * INTO v_note FROM public.credit_notes
      WHERE id = p_origin_id AND organization_id = p_org_id
        AND sales_order_id = p_sale_id AND sales_channel = 'MERCADO_LIBRE' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Nota Meli no encontrada'; END IF;
    IF v_note.status IS DISTINCT FROM 'CONFIRMED'
      OR v_note.arca_status IS DISTINCT FROM 'authorized'
      OR nullif(btrim(v_note.arca_cae), '') IS NULL
      OR v_note.arca_request_json IS NULL
      OR v_note.currency IS DISTINCT FROM v_sale.currency
      OR v_note.amount IS NULL OR v_note.amount <= 0
      OR v_note.arca_point_of_sale IS NULL OR v_note.arca_point_of_sale <= 0
      OR v_note.arca_voucher_type_code IS NULL OR v_note.arca_voucher_type_code <= 0
      OR v_note.arca_voucher_number IS NULL OR v_note.arca_voucher_number <= 0
      OR v_note.arca_associated_point_of_sale IS DISTINCT FROM v_sale.arca_point_of_sale
      OR v_note.arca_associated_voucher_type_code IS DISTINCT FROM v_sale.arca_voucher_type_code
      OR v_note.arca_associated_voucher_number IS DISTINCT FROM v_sale.arca_voucher_number THEN
      RAISE EXCEPTION 'La nota no tiene autorización fiscal verificable';
    END IF;
    v_snapshot := jsonb_build_object(
      'currency', v_sale.currency, 'amount', v_note.amount::text,
      'status', v_note.arca_status, 'cae', v_note.arca_cae,
      'pointOfSale', v_note.arca_point_of_sale, 'voucherType', v_note.arca_voucher_type_code,
      'voucherNumber', v_note.arca_voucher_number, 'request', v_note.arca_request_json,
      'associatedVoucherType', v_note.arca_associated_voucher_type_code,
      'associatedPointOfSale', v_note.arca_associated_point_of_sale,
      'associatedVoucherNumber', v_note.arca_associated_voucher_number,
      'invoiceRequest', v_sale.arca_request_json,
      'invoiceCae', v_sale.arca_cae
    );
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('meli-fiscal-preparation:' || p_org_id::text || ':' || p_request_key::text, 0)
  );
  SELECT * INTO v_existing FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE organization_id = p_org_id AND request_key = p_request_key;
  IF FOUND THEN
    IF v_existing.sale_id IS DISTINCT FROM p_sale_id
      OR v_existing.origin_type IS DISTINCT FROM p_origin_type
      OR v_existing.origin_id IS DISTINCT FROM p_origin_id
      OR v_existing.created_by IS DISTINCT FROM p_actor_id
      OR v_existing.source_snapshot IS DISTINCT FROM v_snapshot THEN
      RAISE EXCEPTION 'La clave ya corresponde a otra preparación fiscal' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.id, true;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE organization_id = p_org_id AND origin_type = p_origin_type AND origin_id = p_origin_id) THEN
    RAISE EXCEPTION 'El comprobante ya tiene una preparación fiscal';
  END IF;
  INSERT INTO public.mercadolibre_fiscal_accounting_preparations (
    organization_id, sale_id, origin_type, origin_id, request_key, source_snapshot, created_by
  ) VALUES (
    p_org_id, p_sale_id, p_origin_type, p_origin_id, p_request_key, v_snapshot, p_actor_id
  ) RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, false;
END;
$$;

CREATE FUNCTION public.get_meli_fiscal_accounting_preparation(
  p_org_id uuid, p_actor_id uuid, p_sale_id uuid, p_origin_type text, p_origin_id uuid
) RETURNS TABLE (
  preparation_id uuid, request_key uuid, source_snapshot jsonb,
  created_by uuid, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_warehouse_id uuid;
BEGIN
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_sale_id IS NULL
    OR p_origin_id IS NULL OR p_origin_type IS NULL
    OR p_origin_type NOT IN ('invoice', 'creditNote')
    OR (p_origin_type = 'invoice' AND p_origin_id <> p_sale_id) THEN
    RAISE EXCEPTION 'Datos de recuperación fiscal inválidos' USING ERRCODE = '22023';
  END IF;
  v_admin := public.assert_meli_accounting_preparation_cleanup_access(p_org_id, p_actor_id);
  SELECT s.warehouse_id INTO v_warehouse_id FROM public.sales_orders s
    WHERE s.id = p_sale_id AND s.organization_id = p_org_id AND s.sales_channel = 'MERCADO_LIBRE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments
      WHERE organization_id = p_org_id AND user_id = p_actor_id AND warehouse_id = v_warehouse_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Depósito no asignado al usuario' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT p.id, p.request_key, p.source_snapshot, p.created_by, p.created_at
    FROM public.mercadolibre_fiscal_accounting_preparations p
    WHERE p.organization_id = p_org_id AND p.sale_id = p_sale_id
      AND p.origin_type = p_origin_type AND p.origin_id = p_origin_id;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_meli_fiscal_accounting(uuid, uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_meli_fiscal_accounting(uuid, uuid, uuid, text, uuid, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.get_meli_fiscal_accounting_preparation(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meli_fiscal_accounting_preparation(uuid, uuid, uuid, text, uuid)
  TO service_role;
COMMIT;
