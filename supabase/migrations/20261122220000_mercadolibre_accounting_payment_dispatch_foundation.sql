-- Internal foundation only: no dispatcher or application-facing RPC is enabled.
BEGIN;

CREATE TABLE public.mercadolibre_accounting_payment_dispatches (
  preparation_id uuid NOT NULL,
  component_key text NOT NULL,
  request_key uuid NOT NULL UNIQUE,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  status text NOT NULL CHECK (status IN ('UNCERTAIN', 'PUBLISHED')),
  journal_entry_id uuid UNIQUE,
  initiated_by uuid NOT NULL REFERENCES auth.users(id),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id),
  published_at timestamptz,
  PRIMARY KEY (preparation_id, component_key),
  FOREIGN KEY (preparation_id, component_key)
    REFERENCES public.mercadolibre_accounting_payment_preparation_components(preparation_id, component_key),
  CHECK ((status = 'UNCERTAIN' AND journal_entry_id IS NULL AND published_by IS NULL AND published_at IS NULL)
    OR (status = 'PUBLISHED' AND journal_entry_id IS NOT NULL AND published_by IS NOT NULL AND published_at IS NOT NULL))
);

ALTER TABLE public.mercadolibre_accounting_payment_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadolibre_accounting_payment_dispatches
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.guard_meli_dispatched_preparation_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'PREPARED' AND NEW.status = 'CANCELLED'
    AND EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_dispatches
      WHERE preparation_id = OLD.id) THEN
    RAISE EXCEPTION 'La preparación tiene envíos contables que requieren recuperación o reversión';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER meli_dispatched_preparation_cancel_guard
  BEFORE UPDATE ON public.mercadolibre_accounting_payment_preparations
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_dispatched_preparation_cancel();

-- Caller must validate the authorized source, antecedent, accounts and complete
-- request before calling. Persist uncertainty before making any network request.
CREATE FUNCTION public.begin_meli_payment_dispatch(
  p_org_id uuid, p_actor_id uuid, p_preparation_id uuid, p_component_key text,
  p_request_key uuid, p_request_payload jsonb
) RETURNS TABLE (dispatch_status text, journal_entry_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_sale_id uuid;
  v_payment public.mercadolibre_payments%ROWTYPE;
  v_preparation public.mercadolibre_accounting_payment_preparations%ROWTYPE;
  v_existing public.mercadolibre_accounting_payment_dispatches%ROWTYPE;
BEGIN
  IF p_preparation_id IS NULL OR p_component_key IS NULL OR p_request_key IS NULL
    OR jsonb_typeof(p_request_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Datos del envío contable inválidos' USING ERRCODE = '22023';
  END IF;
  v_admin := public.assert_meli_accounting_access(p_org_id, p_actor_id);
  SELECT p.sales_order_id INTO v_sale_id
    FROM public.mercadolibre_accounting_payment_preparations a
    JOIN public.mercadolibre_payments p ON p.id = a.payment_id
      AND p.organization_id = a.organization_id
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
  IF v_preparation.status <> 'PREPARED' OR v_payment.status <> 'RECORDED' THEN
    RAISE EXCEPTION 'El cobro o la preparación no están vigentes';
  END IF;
  PERFORM 1 FROM public.mercadolibre_accounting_payment_preparation_components
    WHERE preparation_id = p_preparation_id AND component_key = p_component_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Componente contable no encontrado'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'meli-payment-dispatch:' || p_request_key::text, 0));
  SELECT * INTO v_existing FROM public.mercadolibre_accounting_payment_dispatches
    WHERE request_key = p_request_key;
  IF FOUND THEN
    IF v_existing.preparation_id IS DISTINCT FROM p_preparation_id
      OR v_existing.component_key IS DISTINCT FROM p_component_key
      OR v_existing.request_payload IS DISTINCT FROM p_request_payload
      OR v_existing.initiated_by IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'La clave ya corresponde a otro envío contable' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.status, v_existing.journal_entry_id, true;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_dispatches
    WHERE preparation_id = p_preparation_id AND component_key = p_component_key) THEN
    RAISE EXCEPTION 'El componente ya tiene un envío contable';
  END IF;
  INSERT INTO public.mercadolibre_accounting_payment_dispatches (
    preparation_id, component_key, request_key, request_payload, status, initiated_by
  ) VALUES (
    p_preparation_id, p_component_key, p_request_key, p_request_payload, 'UNCERTAIN', p_actor_id
  );
  RETURN QUERY SELECT 'UNCERTAIN'::text, NULL::uuid, false;
END;
$$;

-- The caller must independently verify the accounting service receipt, including
-- organization and the exact persisted payload, before confirming publication.
CREATE FUNCTION public.confirm_meli_payment_dispatch(
  p_org_id uuid, p_actor_id uuid, p_preparation_id uuid, p_component_key text,
  p_request_key uuid, p_request_payload jsonb, p_journal_entry_id uuid
) RETURNS TABLE (dispatch_status text, journal_entry_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_sale_id uuid;
  v_payment public.mercadolibre_payments%ROWTYPE;
  v_existing public.mercadolibre_accounting_payment_dispatches%ROWTYPE;
BEGIN
  IF p_preparation_id IS NULL OR p_component_key IS NULL OR p_request_key IS NULL
    OR p_journal_entry_id IS NULL
    OR jsonb_typeof(p_request_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Confirmación contable inválida' USING ERRCODE = '22023';
  END IF;
  v_admin := public.assert_meli_accounting_preparation_cleanup_access(p_org_id, p_actor_id);
  SELECT p.sales_order_id INTO v_sale_id
    FROM public.mercadolibre_accounting_payment_preparations a
    JOIN public.mercadolibre_payments p ON p.id = a.payment_id
      AND p.organization_id = a.organization_id
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
  PERFORM 1 FROM public.mercadolibre_accounting_payment_preparations
    WHERE id = p_preparation_id AND organization_id = p_org_id AND status = 'PREPARED' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación contable no vigente'; END IF;
  SELECT * INTO v_existing FROM public.mercadolibre_accounting_payment_dispatches
    WHERE preparation_id = p_preparation_id AND component_key = p_component_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Envío contable no encontrado'; END IF;
  IF v_existing.request_key IS DISTINCT FROM p_request_key
    OR v_existing.request_payload IS DISTINCT FROM p_request_payload THEN
    RAISE EXCEPTION 'La confirmación no coincide con el envío contable' USING ERRCODE = '22023';
  END IF;
  IF v_existing.status = 'PUBLISHED' THEN
    IF v_existing.journal_entry_id IS DISTINCT FROM p_journal_entry_id THEN
      RAISE EXCEPTION 'El envío ya está vinculado a otro asiento' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.status, v_existing.journal_entry_id, true;
    RETURN;
  END IF;
  UPDATE public.mercadolibre_accounting_payment_dispatches d
    SET status = 'PUBLISHED', journal_entry_id = p_journal_entry_id,
      published_by = p_actor_id, published_at = now()
    WHERE d.preparation_id = p_preparation_id AND d.component_key = p_component_key;
  RETURN QUERY SELECT 'PUBLISHED'::text, p_journal_entry_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_meli_dispatched_preparation_cancel()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.begin_meli_payment_dispatch(uuid, uuid, uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_meli_payment_dispatch(uuid, uuid, uuid, text, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
