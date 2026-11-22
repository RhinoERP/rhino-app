-- Durable preparation only. This migration neither publishes nor authorizes
-- journal entries; a future publisher must add its own dispatch state machine.
BEGIN;

CREATE TABLE public.mercadolibre_accounting_payment_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  payment_id uuid NOT NULL REFERENCES public.mercadolibre_payments(id),
  draft_id uuid NOT NULL REFERENCES public.mercadolibre_accounting_breakdown_drafts(id),
  idempotency_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED', 'CANCELLED')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid REFERENCES auth.users(id),
  cancelled_at timestamptz,
  CHECK ((status = 'PREPARED' AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR (status = 'CANCELLED' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)),
  UNIQUE (organization_id, idempotency_key)
);

CREATE UNIQUE INDEX meli_accounting_payment_one_preparation
  ON public.mercadolibre_accounting_payment_preparations(payment_id) WHERE status = 'PREPARED';

CREATE TABLE public.mercadolibre_accounting_payment_preparation_components (
  preparation_id uuid NOT NULL REFERENCES public.mercadolibre_accounting_payment_preparations(id),
  component_key text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  debit_account jsonb NOT NULL,
  credit_account jsonb NOT NULL,
  PRIMARY KEY (preparation_id, component_key)
);

ALTER TABLE public.mercadolibre_accounting_payment_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolibre_accounting_payment_preparation_components ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadolibre_accounting_payment_preparations,
  public.mercadolibre_accounting_payment_preparation_components FROM PUBLIC, anon, authenticated, service_role;

-- A preparation serializes with the existing save/void RPCs on the payment row.
CREATE FUNCTION public.guard_meli_prepared_accounting_draft()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.active AND NOT NEW.active AND EXISTS (
    SELECT 1 FROM public.mercadolibre_accounting_payment_preparations p
    WHERE p.draft_id = OLD.id AND p.status = 'PREPARED'
  ) THEN
    RAISE EXCEPTION 'Cancelá la preparación contable antes de modificar el desglose';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meli_prepared_accounting_draft_guard
  BEFORE UPDATE ON public.mercadolibre_accounting_breakdown_drafts
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_prepared_accounting_draft();

CREATE FUNCTION public.guard_meli_prepared_payment_void()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'RECORDED' AND NEW.status = 'VOIDED' AND EXISTS (
    SELECT 1 FROM public.mercadolibre_accounting_payment_preparations p
    WHERE p.payment_id = OLD.id AND p.status = 'PREPARED'
  ) THEN
    RAISE EXCEPTION 'Cancelá la preparación contable antes de anular el cobro';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meli_prepared_payment_void_guard
  BEFORE UPDATE ON public.mercadolibre_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_prepared_payment_void();

CREATE FUNCTION public.prepare_meli_accounting_payment(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid, p_draft_id uuid, p_idempotency_key uuid
) RETURNS TABLE (preparation_id uuid, idempotent boolean, preparation_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_sale_id uuid;
  v_payment public.mercadolibre_payments%ROWTYPE;
  v_draft public.mercadolibre_accounting_breakdown_drafts%ROWTYPE;
  v_existing public.mercadolibre_accounting_payment_preparations%ROWTYPE;
  v_id uuid;
  v_breakdown jsonb;
  v_key text;
  v_code text;
  v_description text;
  v_amount numeric;
  v_item jsonb;
  v_index bigint;
  v_account jsonb;
  v_counterpart jsonb := '{"kind":"semantic","code":"AR_DEUDORES_VENTAS"}'::jsonb;
BEGIN
  IF p_payment_id IS NULL OR p_draft_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Cobro, desglose y clave son obligatorios' USING ERRCODE = '22023';
  END IF;
  v_admin := public.assert_meli_accounting_access(p_org_id, p_actor_id);
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
    'meli-accounting-preparation:' || p_org_id::text || ':' || p_idempotency_key::text, 0));
  SELECT * INTO v_existing FROM public.mercadolibre_accounting_payment_preparations
    WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.payment_id IS DISTINCT FROM p_payment_id
      OR v_existing.draft_id IS DISTINCT FROM p_draft_id
      OR v_existing.created_by IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'La clave ya corresponde a otra preparación' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.id, true, v_existing.status;
    RETURN;
  END IF;
  SELECT * INTO v_draft FROM public.mercadolibre_accounting_breakdown_drafts
    WHERE id = p_draft_id AND organization_id = p_org_id AND payment_id = p_payment_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'El desglose activo no corresponde al cobro'; END IF;
  IF v_payment.status <> 'RECORDED' OR v_draft.gross_amount <> v_payment.amount
    OR v_draft.currency <> v_payment.currency OR v_draft.payment_date <> v_payment.payment_date THEN
    RAISE EXCEPTION 'El cobro o su desglose ya no están vigentes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_preparations
    WHERE payment_id = p_payment_id AND status = 'PREPARED') THEN
    RAISE EXCEPTION 'El cobro ya tiene una preparación activa';
  END IF;
  INSERT INTO public.mercadolibre_accounting_payment_preparations(
    organization_id, payment_id, draft_id, idempotency_key, created_by
  ) VALUES (p_org_id, p_payment_id, p_draft_id, p_idempotency_key, p_actor_id)
  RETURNING id INTO v_id;
  v_breakdown := v_draft.request_payload->'breakdown';
  FOR v_key, v_description, v_code IN
    SELECT * FROM (VALUES
      ('net', 'Neto acreditado', 'MERCADO_PAGO'),
      ('discount', 'Descuento', 'DESCUENTOS_OTORGADOS'),
      ('commission', 'Comisión', 'COMISIONES_POR_VENTAS'),
      ('shipping', 'Envío', 'VIATICOS')
    ) AS fixed_components(component_key, description, code)
  LOOP
    v_amount := (v_breakdown->>v_key)::numeric;
    IF v_amount > 0 THEN
      INSERT INTO public.mercadolibre_accounting_payment_preparation_components
        VALUES (v_id, v_key, v_description, v_amount,
          jsonb_build_object('kind', 'semantic', 'code', v_code), v_counterpart);
    END IF;
  END LOOP;
  FOR v_item, v_index IN
    SELECT value, ordinality FROM jsonb_array_elements(coalesce(v_breakdown->'manualConcepts', '[]'::jsonb))
      WITH ORDINALITY
  LOOP
    v_account := jsonb_build_object('kind', 'manual', 'id', v_item->>'accountId');
    INSERT INTO public.mercadolibre_accounting_payment_preparation_components
      VALUES (v_id, 'manual:' || v_index::text, v_item->>'description', (v_item->>'amount')::numeric,
        CASE WHEN v_item->>'direction' = 'ADD' THEN v_account ELSE v_counterpart END,
        CASE WHEN v_item->>'direction' = 'ADD' THEN v_counterpart ELSE v_account END);
  END LOOP;
  RETURN QUERY SELECT v_id, false, 'PREPARED'::text;
END;
$$;

-- Cancellation is safe only while no dispatcher exists. Any future dispatcher
-- must replace this transition before sending an accounting request.
-- Allow cleanup even if the integration was disabled after preparation.
CREATE FUNCTION public.assert_meli_accounting_preparation_cleanup_access(p_org_id uuid, p_actor_id uuid)
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
  RETURN v_admin;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_meli_accounting_preparation_cleanup_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.cancel_meli_accounting_payment_preparation(
  p_org_id uuid, p_actor_id uuid, p_preparation_id uuid
) RETURNS TABLE (preparation_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_payment public.mercadolibre_payments%ROWTYPE;
  v_sale_id uuid;
  v_preparation public.mercadolibre_accounting_payment_preparations%ROWTYPE;
BEGIN
  v_admin := public.assert_meli_accounting_preparation_cleanup_access(p_org_id, p_actor_id);
  SELECT p.sales_order_id INTO v_sale_id
    FROM public.mercadolibre_accounting_payment_preparations a
    JOIN public.mercadolibre_payments p ON p.id = a.payment_id AND p.organization_id = a.organization_id
    WHERE a.id = p_preparation_id AND a.organization_id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación contable no encontrada'; END IF;
  PERFORM 1 FROM public.sales_orders WHERE id = v_sale_id AND organization_id = p_org_id
    AND sales_channel = 'MERCADO_LIBRE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  SELECT p.* INTO v_payment FROM public.mercadolibre_payments p
    JOIN public.mercadolibre_accounting_payment_preparations a ON a.payment_id = p.id
    WHERE a.id = p_preparation_id AND a.organization_id = p_org_id
      AND p.organization_id = p_org_id FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobro Meli no encontrado'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments WHERE organization_id = p_org_id
      AND user_id = p_actor_id AND warehouse_id = v_payment.warehouse_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Depósito no asignado al usuario' USING ERRCODE = '42501'; END IF;
  END IF;
  SELECT * INTO v_preparation FROM public.mercadolibre_accounting_payment_preparations
    WHERE id = p_preparation_id AND organization_id = p_org_id FOR UPDATE;
  IF v_preparation.status = 'CANCELLED' THEN
    RETURN QUERY SELECT v_preparation.id, true;
    RETURN;
  END IF;
  UPDATE public.mercadolibre_accounting_payment_preparations
    SET status = 'CANCELLED', cancelled_by = p_actor_id, cancelled_at = now()
    WHERE id = v_preparation.id;
  RETURN QUERY SELECT v_preparation.id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_meli_accounting_payment(uuid, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_meli_accounting_payment_preparation(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_meli_accounting_payment(uuid, uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_meli_accounting_payment_preparation(uuid, uuid, uuid) TO service_role;
COMMIT;
