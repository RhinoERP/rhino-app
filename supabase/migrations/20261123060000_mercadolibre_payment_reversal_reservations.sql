-- Unconnected reversal foundation. It does not reverse or void a payment.
BEGIN;

CREATE TABLE public.mercadolibre_payment_reversal_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  payment_id uuid NOT NULL REFERENCES public.mercadolibre_payments(id),
  preparation_id uuid NOT NULL UNIQUE REFERENCES public.mercadolibre_accounting_payment_preparations(id),
  request_key uuid NOT NULL UNIQUE,
  reversal_date date NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  reversal_description text NOT NULL CHECK (length(btrim(reversal_description)) BETWEEN 1 AND 2000),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'FINALIZING', 'VOIDED')),
  finalized_by uuid REFERENCES auth.users(id),
  finalized_at timestamptz,
  CHECK ((status = 'VOIDED' AND finalized_by IS NOT NULL AND finalized_at IS NOT NULL)
    OR (status <> 'VOIDED' AND finalized_by IS NULL AND finalized_at IS NULL)),
  UNIQUE (payment_id)
);

CREATE TABLE public.mercadolibre_payment_reversal_components (
  reservation_id uuid NOT NULL REFERENCES public.mercadolibre_payment_reversal_reservations(id),
  component_key text NOT NULL,
  original_entry_id uuid NOT NULL UNIQUE,
  request_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  reversal_entry_id uuid UNIQUE,
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  PRIMARY KEY (reservation_id, component_key),
  CHECK ((reversal_entry_id IS NULL AND confirmed_by IS NULL AND confirmed_at IS NULL)
    OR (reversal_entry_id IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);

ALTER TABLE public.mercadolibre_payment_reversal_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolibre_payment_reversal_components ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadolibre_payment_reversal_reservations,
  public.mercadolibre_payment_reversal_components FROM PUBLIC, anon, authenticated, service_role;

-- Use the same sale/payment lock order as dispatch and preparation operations.
CREATE FUNCTION public.lock_meli_reversal_payment(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid
) RETURNS public.mercadolibre_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_sale_id uuid;
  v_payment public.mercadolibre_payments%ROWTYPE;
BEGIN
  v_admin := public.assert_meli_accounting_preparation_cleanup_access(p_org_id, p_actor_id);
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
  RETURN v_payment;
END;
$$;

CREATE FUNCTION public.reserve_meli_payment_reversal(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid, p_preparation_id uuid,
  p_request_key uuid, p_reversal_date date, p_reason text
) RETURNS TABLE (reservation_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_payment public.mercadolibre_payments%ROWTYPE;
  v_preparation public.mercadolibre_accounting_payment_preparations%ROWTYPE;
  v_existing public.mercadolibre_payment_reversal_reservations%ROWTYPE;
  v_reservation uuid;
BEGIN
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_payment_id IS NULL
    OR p_preparation_id IS NULL OR p_request_key IS NULL OR p_reversal_date IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Datos de reserva de reversión inválidos' USING ERRCODE = '22023';
  END IF;
  v_payment := public.lock_meli_reversal_payment(p_org_id, p_actor_id, p_payment_id);
  SELECT * INTO v_preparation FROM public.mercadolibre_accounting_payment_preparations
    WHERE id = p_preparation_id AND organization_id = p_org_id
      AND payment_id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación contable no encontrada'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('meli-payment-reversal-reservation:' || p_request_key::text, 0));
  SELECT * INTO v_existing FROM public.mercadolibre_payment_reversal_reservations
    WHERE request_key = p_request_key;
  IF FOUND THEN
    IF v_existing.organization_id IS DISTINCT FROM p_org_id
      OR v_existing.payment_id IS DISTINCT FROM p_payment_id
      OR v_existing.preparation_id IS DISTINCT FROM p_preparation_id
      OR v_existing.created_by IS DISTINCT FROM p_actor_id
      OR v_existing.reversal_date IS DISTINCT FROM p_reversal_date
      OR v_existing.reason IS DISTINCT FROM btrim(p_reason) THEN
      RAISE EXCEPTION 'La clave ya corresponde a otra reversión' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.id, true;
    RETURN;
  END IF;
  IF v_payment.status <> 'RECORDED' OR v_preparation.status <> 'PREPARED'
    OR p_reversal_date < v_payment.payment_date THEN
    RAISE EXCEPTION 'El cobro, la preparación o la fecha no permiten la reversión';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_dispatches
    WHERE preparation_id = p_preparation_id AND status = 'UNCERTAIN') THEN
    RAISE EXCEPTION 'Resolvé los envíos inciertos antes de reservar la reversión';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_dispatches
    WHERE preparation_id = p_preparation_id AND status = 'PUBLISHED') THEN
    RAISE EXCEPTION 'No hay asientos publicados para revertir';
  END IF;
  INSERT INTO public.mercadolibre_payment_reversal_reservations (
    organization_id, payment_id, preparation_id, request_key, reversal_date,
    reason, reversal_description, created_by
  ) VALUES (
    p_org_id, p_payment_id, p_preparation_id, p_request_key, p_reversal_date,
    btrim(p_reason), 'Reversión cobro Meli: ' || btrim(p_reason), p_actor_id
  ) RETURNING id INTO v_reservation;
  INSERT INTO public.mercadolibre_payment_reversal_components (
    reservation_id, component_key, original_entry_id
  )
    SELECT v_reservation, component_key, journal_entry_id
    FROM public.mercadolibre_accounting_payment_dispatches
    WHERE preparation_id = p_preparation_id AND status = 'PUBLISHED';
  RETURN QUERY SELECT v_reservation, false;
END;
$$;

CREATE FUNCTION public.guard_meli_reversal_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_payment_id uuid;
BEGIN
  SELECT payment_id INTO v_payment_id FROM public.mercadolibre_accounting_payment_preparations
    WHERE id = NEW.preparation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación contable no encontrada'; END IF;
  PERFORM 1 FROM public.mercadolibre_payments WHERE id = v_payment_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.mercadolibre_payment_reversal_reservations
    WHERE payment_id = v_payment_id) THEN
    RAISE EXCEPTION 'El cobro tiene una reversión en curso';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meli_reversal_dispatch_guard
  BEFORE INSERT ON public.mercadolibre_accounting_payment_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_reversal_dispatch();

-- Only the isolated finalizer can transition a prepared payment to VOIDED.
CREATE OR REPLACE FUNCTION public.guard_meli_prepared_payment_void()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'RECORDED' AND NEW.status = 'VOIDED' AND EXISTS (
    SELECT 1 FROM public.mercadolibre_accounting_payment_preparations p
    WHERE p.payment_id = OLD.id AND p.status = 'PREPARED'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.mercadolibre_payment_reversal_reservations r
    WHERE r.organization_id = OLD.organization_id AND r.payment_id = OLD.id
      AND r.status = 'FINALIZING'
  ) THEN
    RAISE EXCEPTION 'Cancelá la preparación contable antes de anular el cobro';
  END IF;
  RETURN NEW;
END;
$$;

-- A caller must verify the exact original and reversal receipt before confirming.
CREATE FUNCTION public.confirm_meli_payment_reversal_component(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid, p_reservation_id uuid,
  p_component_key text, p_request_key uuid, p_reversal_entry_id uuid
) RETURNS TABLE (idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_payment public.mercadolibre_payments%ROWTYPE;
  v_component public.mercadolibre_payment_reversal_components%ROWTYPE;
BEGIN
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_payment_id IS NULL
    OR p_reservation_id IS NULL OR p_component_key IS NULL OR p_request_key IS NULL
    OR p_reversal_entry_id IS NULL THEN
    RAISE EXCEPTION 'Confirmación de reversión inválida' USING ERRCODE = '22023';
  END IF;
  v_payment := public.lock_meli_reversal_payment(p_org_id, p_actor_id, p_payment_id);
  IF v_payment.status <> 'RECORDED' THEN
    RAISE EXCEPTION 'El cobro dejó de estar vigente';
  END IF;
  PERFORM 1 FROM public.mercadolibre_payment_reversal_reservations
    WHERE id = p_reservation_id AND organization_id = p_org_id
      AND payment_id = p_payment_id AND status = 'RESERVED' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva de reversión no encontrada'; END IF;
  SELECT * INTO v_component FROM public.mercadolibre_payment_reversal_components
    WHERE reservation_id = p_reservation_id AND component_key = p_component_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Componente de reversión no encontrado'; END IF;
  IF v_component.request_key IS DISTINCT FROM p_request_key THEN
    RAISE EXCEPTION 'La clave no coincide con la reversión' USING ERRCODE = '22023';
  END IF;
  IF v_component.reversal_entry_id IS NOT NULL THEN
    IF v_component.reversal_entry_id IS DISTINCT FROM p_reversal_entry_id THEN
      RAISE EXCEPTION 'La reversión ya está vinculada a otro asiento' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT true;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mercadolibre_payment_reversal_components
    WHERE original_entry_id = p_reversal_entry_id) THEN
    RAISE EXCEPTION 'La reversión no puede ser un asiento original' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mercadolibre_payment_reversal_components c
    SET reversal_entry_id = p_reversal_entry_id, confirmed_by = p_actor_id, confirmed_at = now()
    WHERE c.reservation_id = p_reservation_id AND c.component_key = p_component_key;
  RETURN QUERY SELECT false;
END;
$$;

-- The caller must independently verify every receipt and reconcile the complete
-- accounting history before confirming components and calling this finalizer.
CREATE FUNCTION public.finalize_meli_payment_reversal(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid, p_reservation_id uuid
) RETURNS TABLE (payment_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_payment public.mercadolibre_payments%ROWTYPE;
  v_reservation public.mercadolibre_payment_reversal_reservations%ROWTYPE;
  v_void record;
BEGIN
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_payment_id IS NULL
    OR p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'Datos de finalización inválidos' USING ERRCODE = '22023';
  END IF;
  v_payment := public.lock_meli_reversal_payment(p_org_id, p_actor_id, p_payment_id);
  PERFORM public.assert_meli_payment_access(p_org_id, p_actor_id, true);
  SELECT r.* INTO v_reservation FROM public.mercadolibre_payment_reversal_reservations r
    WHERE r.id = p_reservation_id AND r.organization_id = p_org_id
      AND r.payment_id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva de reversión no encontrada'; END IF;
  IF v_reservation.status = 'VOIDED' THEN
    IF v_payment.status <> 'VOIDED' THEN
      RAISE EXCEPTION 'La reserva finalizada no coincide con el cobro';
    END IF;
    RETURN QUERY SELECT p_payment_id, true;
    RETURN;
  END IF;
  IF v_reservation.status <> 'RESERVED' OR v_payment.status <> 'RECORDED' THEN
    RAISE EXCEPTION 'La reserva o el cobro no permiten finalizar';
  END IF;
  PERFORM 1 FROM public.mercadolibre_accounting_payment_preparations p
    WHERE p.id = v_reservation.preparation_id AND p.organization_id = p_org_id
      AND p.payment_id = p_payment_id AND p.status = 'PREPARED' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación contable no vigente'; END IF;
  IF EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_dispatches
    WHERE preparation_id = v_reservation.preparation_id AND status <> 'PUBLISHED')
    OR NOT EXISTS (SELECT 1 FROM public.mercadolibre_payment_reversal_components
      WHERE reservation_id = p_reservation_id)
    OR EXISTS (SELECT 1 FROM public.mercadolibre_payment_reversal_components c
      LEFT JOIN public.mercadolibre_accounting_payment_dispatches d
        ON d.preparation_id = v_reservation.preparation_id AND d.component_key = c.component_key
      WHERE c.reservation_id = p_reservation_id AND (
        c.reversal_entry_id IS NULL OR c.confirmed_by IS NULL OR c.confirmed_at IS NULL
        OR d.status IS DISTINCT FROM 'PUBLISHED'
        OR d.journal_entry_id IS DISTINCT FROM c.original_entry_id))
    OR EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_dispatches d
      WHERE d.preparation_id = v_reservation.preparation_id AND NOT EXISTS (
        SELECT 1 FROM public.mercadolibre_payment_reversal_components c
        WHERE c.reservation_id = p_reservation_id AND c.component_key = d.component_key
          AND c.original_entry_id = d.journal_entry_id)) THEN
    RAISE EXCEPTION 'La reversión está incompleta o no coincide con los envíos';
  END IF;
  UPDATE public.mercadolibre_payment_reversal_reservations
    SET status = 'FINALIZING' WHERE id = p_reservation_id;
  SELECT * INTO v_void FROM public.void_mercadolibre_payment(
    p_org_id, p_actor_id, p_payment_id, v_reservation.reason);
  IF v_void.payment_id IS DISTINCT FROM p_payment_id
    OR v_void.payment_status IS DISTINCT FROM 'VOIDED'
    OR v_void.idempotent IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'No se confirmó la anulación comercial';
  END IF;
  UPDATE public.mercadolibre_payment_reversal_reservations
    SET status = 'VOIDED', finalized_by = p_actor_id, finalized_at = now()
    WHERE id = p_reservation_id;
  RETURN QUERY SELECT p_payment_id, false;
END;
$$;

CREATE FUNCTION public.get_meli_payment_reversal_reservation(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid
) RETURNS TABLE (
  reservation_id uuid, preparation_id uuid, request_key uuid, reversal_date date,
  reason text, reversal_description text, created_by uuid, created_at timestamptz,
  status text, payment_status text, finalized_by uuid, finalized_at timestamptz, components jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_payment public.mercadolibre_payments%ROWTYPE;
BEGIN
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Datos de recuperación de reversión inválidos' USING ERRCODE = '22023';
  END IF;
  v_payment := public.lock_meli_reversal_payment(p_org_id, p_actor_id, p_payment_id);
  RETURN QUERY
    SELECT r.id, r.preparation_id, r.request_key, r.reversal_date, r.reason, r.reversal_description,
      r.created_by, r.created_at, r.status, v_payment.status, r.finalized_by, r.finalized_at,
      coalesce(jsonb_agg(jsonb_build_object(
        'componentKey', c.component_key, 'originalEntryId', c.original_entry_id,
        'requestKey', c.request_key, 'reversalEntryId', c.reversal_entry_id,
        'confirmedBy', c.confirmed_by, 'confirmedAt', c.confirmed_at
      ) ORDER BY c.component_key) FILTER (WHERE c.component_key IS NOT NULL), '[]'::jsonb)
    FROM public.mercadolibre_payment_reversal_reservations r
    LEFT JOIN public.mercadolibre_payment_reversal_components c ON c.reservation_id = r.id
    WHERE r.organization_id = p_org_id AND r.payment_id = v_payment.id
    GROUP BY r.id;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_meli_reversal_payment(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reserve_meli_payment_reversal(uuid, uuid, uuid, uuid, uuid, date, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_reversal_dispatch()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_meli_payment_reversal_component(uuid, uuid, uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_meli_payment_reversal(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_meli_payment_reversal_reservation(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meli_payment_reversal_reservation(uuid, uuid, uuid)
  TO service_role;
COMMIT;
