-- Accounting drafts are separate from operational gross payments. This migration
-- does not publish journal entries or enable the integration.
BEGIN;

INSERT INTO public.permissions(key, description) VALUES
  ('mercadolibre.accounting.manage', 'Revisar y gestionar la contabilización Mercado Libre en los depósitos asignados')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

CREATE TABLE public.mercadolibre_accounting_breakdown_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  payment_id uuid NOT NULL REFERENCES public.mercadolibre_payments(id),
  version integer NOT NULL CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  idempotency_key uuid NOT NULL,
  expected_version integer NOT NULL CHECK (expected_version >= 0),
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  gross_amount numeric NOT NULL,
  currency text NOT NULL CHECK (currency IN ('ARS', 'USD')),
  payment_date date NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (payment_id, version)
);

CREATE UNIQUE INDEX mercadolibre_accounting_breakdown_one_active
  ON public.mercadolibre_accounting_breakdown_drafts(payment_id) WHERE active;
ALTER TABLE public.mercadolibre_accounting_breakdown_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadolibre_accounting_breakdown_drafts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.assert_meli_accounting_access(p_org_id uuid, p_actor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin boolean; v_has_permission boolean;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'La contabilidad Meli requiere el servicio autorizado' USING ERRCODE = '42501';
  END IF;
  v_admin := public.assert_meli_payment_access(p_org_id, p_actor_id, false);
  SELECT coalesce(bool_or(p.key = 'mercadolibre.accounting.manage'), false)
    INTO v_has_permission
    FROM public.organization_members m
    LEFT JOIN public.roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
    LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
    LEFT JOIN public.permissions p ON p.id = rp.permission_id
    WHERE m.organization_id = p_org_id AND m.user_id = p_actor_id AND m.is_active;
  IF NOT (v_admin OR v_has_permission) THEN
    RAISE EXCEPTION 'Sin permiso para gestionar la contabilización Meli' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.organization_settings s
    WHERE s.organization_id = p_org_id
      AND s.settings->'accounting_integration_enabled' = 'true'::jsonb
      AND s.settings->'mercadolibre_accounting_enabled' = 'true'::jsonb;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La integración contable Meli no está habilitada' USING ERRCODE = '42501';
  END IF;
  RETURN v_admin;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_meli_accounting_access(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_meli_accounting_breakdown_draft(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid,
  p_idempotency_key uuid, p_expected_version integer, p_breakdown jsonb, p_evidence text
)
RETURNS TABLE (draft_id uuid, version integer, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_payment public.mercadolibre_payments%ROWTYPE;
  v_existing public.mercadolibre_accounting_breakdown_drafts%ROWTYPE;
  v_sale_id uuid;
  v_payload jsonb;
  v_item jsonb;
  v_value text;
  v_total numeric := 0;
  v_next integer;
  v_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'El desglose requiere el servicio autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'Clave o versión de desglose inválida' USING ERRCODE = '22023';
  END IF;
  v_admin := public.assert_meli_accounting_access(p_org_id, p_actor_id);
  IF jsonb_typeof(p_breakdown) IS DISTINCT FROM 'object'
    OR p_breakdown - ARRAY['net', 'discount', 'commission', 'shipping', 'manualConcepts'] <> '{}'::jsonb
    OR p_evidence IS NULL OR length(p_evidence) > 2000 THEN
    RAISE EXCEPTION 'Desglose contable inválido' USING ERRCODE = '22023';
  END IF;
  FOREACH v_value IN ARRAY ARRAY['net', 'discount', 'commission', 'shipping'] LOOP
    IF jsonb_typeof(p_breakdown->v_value) IS DISTINCT FROM 'string'
      OR (p_breakdown->>v_value) !~ '^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$'
      OR (p_breakdown->>v_value)::numeric > 90071992547409.91 THEN
      RAISE EXCEPTION 'Importe inválido en %', v_value USING ERRCODE = '22023';
    END IF;
    v_total := v_total + (p_breakdown->>v_value)::numeric;
  END LOOP;
  IF p_breakdown ? 'manualConcepts' THEN
    IF jsonb_typeof(p_breakdown->'manualConcepts') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_breakdown->'manualConcepts') > 100 THEN
      RAISE EXCEPTION 'Conceptos manuales inválidos' USING ERRCODE = '22023';
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_breakdown->'manualConcepts') LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
        OR v_item - ARRAY['description', 'accountId', 'amount', 'direction'] <> '{}'::jsonb
        OR jsonb_typeof(v_item->'description') IS DISTINCT FROM 'string'
        OR length(btrim(v_item->>'description')) NOT BETWEEN 1 AND 200
        OR jsonb_typeof(v_item->'accountId') IS DISTINCT FROM 'string'
        OR (v_item->>'accountId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR jsonb_typeof(v_item->'amount') IS DISTINCT FROM 'string'
        OR (v_item->>'amount') !~ '^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$'
        OR jsonb_typeof(v_item->'direction') IS DISTINCT FROM 'string'
        OR (v_item->>'direction') NOT IN ('ADD', 'SUBTRACT') THEN
        RAISE EXCEPTION 'Concepto manual inválido' USING ERRCODE = '22023';
      END IF;
      IF (v_item->>'amount')::numeric <= 0 OR (v_item->>'amount')::numeric > 90071992547409.91 THEN
        RAISE EXCEPTION 'Importe manual inválido' USING ERRCODE = '22023';
      END IF;
      v_total := v_total + (CASE WHEN v_item->>'direction' = 'ADD' THEN 1 ELSE -1 END) * (v_item->>'amount')::numeric;
    END LOOP;
  END IF;
  v_payload := jsonb_build_object('breakdown', p_breakdown, 'evidence', btrim(p_evidence));

  SELECT sales_order_id INTO v_sale_id FROM public.mercadolibre_payments
    WHERE id = p_payment_id AND organization_id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobro Meli no encontrado'; END IF;
  PERFORM 1 FROM public.sales_orders WHERE id = v_sale_id AND organization_id = p_org_id
    AND sales_channel = 'MERCADO_LIBRE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  SELECT * INTO v_payment FROM public.mercadolibre_payments
    WHERE id = p_payment_id AND organization_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobro Meli no encontrado'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments WHERE organization_id = p_org_id
      AND user_id = p_actor_id AND warehouse_id = v_payment.warehouse_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Depósito no asignado al usuario' USING ERRCODE = '42501'; END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'meli-accounting-draft:' || p_org_id::text || ':' || p_idempotency_key::text, 0));
  SELECT * INTO v_existing FROM public.mercadolibre_accounting_breakdown_drafts
    WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.payment_id IS DISTINCT FROM p_payment_id
      OR v_existing.created_by IS DISTINCT FROM p_actor_id
      OR v_existing.expected_version IS DISTINCT FROM p_expected_version
      OR v_existing.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'La clave ya corresponde a otro desglose' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.version, true;
    RETURN;
  END IF;
  IF v_payment.status <> 'RECORDED' THEN
    RAISE EXCEPTION 'No se puede desglosar un cobro anulado';
  END IF;
  IF v_total <> v_payment.amount THEN
    RAISE EXCEPTION 'El desglose contable no coincide con el cobro bruto' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(max(d.version), 0) + 1 INTO v_next
    FROM public.mercadolibre_accounting_breakdown_drafts d WHERE d.payment_id = p_payment_id;
  IF p_expected_version <> v_next - 1 THEN
    RAISE EXCEPTION 'El desglose cambió. Actualizá el historial antes de guardar.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.mercadolibre_accounting_breakdown_drafts SET active = false
    WHERE payment_id = p_payment_id AND active;
  INSERT INTO public.mercadolibre_accounting_breakdown_drafts(
    organization_id, payment_id, version, idempotency_key, expected_version, request_payload,
    gross_amount, currency, payment_date, created_by
  ) VALUES (
    p_org_id, p_payment_id, v_next, p_idempotency_key, p_expected_version, v_payload,
    v_payment.amount, v_payment.currency, v_payment.payment_date, p_actor_id
  ) RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_next, false;
END;
$$;

REVOKE ALL ON FUNCTION public.save_meli_accounting_breakdown_draft(uuid, uuid, uuid, uuid, integer, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_meli_accounting_breakdown_draft(uuid, uuid, uuid, uuid, integer, jsonb, text)
  TO service_role;

CREATE FUNCTION public.list_meli_accounting_breakdown_drafts(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid
)
RETURNS TABLE (
  id uuid, version integer, active boolean, request_payload jsonb,
  gross_amount text, currency text, payment_date date, created_by uuid, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin boolean; v_warehouse_id uuid;
BEGIN
  v_admin := public.assert_meli_accounting_access(p_org_id, p_actor_id);
  SELECT p.warehouse_id INTO v_warehouse_id
    FROM public.mercadolibre_payments p
    JOIN public.sales_orders s ON s.id = p.sales_order_id AND s.organization_id = p.organization_id
    WHERE p.id = p_payment_id AND p.organization_id = p_org_id AND s.sales_channel = 'MERCADO_LIBRE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobro Meli no encontrado'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments WHERE organization_id = p_org_id
      AND user_id = p_actor_id AND warehouse_id = v_warehouse_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Depósito no asignado al usuario' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN QUERY SELECT d.id, d.version, d.active, d.request_payload,
    d.gross_amount::text, d.currency, d.payment_date, d.created_by, d.created_at
    FROM public.mercadolibre_accounting_breakdown_drafts d
    WHERE d.organization_id = p_org_id AND d.payment_id = p_payment_id
    ORDER BY d.version DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.list_meli_accounting_breakdown_drafts(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_meli_accounting_breakdown_drafts(uuid, uuid, uuid) TO service_role;
COMMIT;
