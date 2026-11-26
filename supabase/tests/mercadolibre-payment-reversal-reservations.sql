-- Run only against an empty disposable PostgreSQL instance; creates roles and fixtures.
\set ON_ERROR_STOP on
\ir mercadolibre-accounting-payment-dispatch-foundation.sql
-- Minimal fixture for the existing commercial void RPC.
ALTER TABLE public.mercadolibre_payments ADD COLUMN voided_by uuid;
ALTER TABLE public.mercadolibre_payments ADD COLUMN void_reason text;
CREATE FUNCTION public.void_mercadolibre_payment(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid, p_reason text
) RETURNS TABLE (payment_id uuid, idempotent boolean, payment_status text)
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Rol inválido' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_meli_payment_access(p_org_id, p_actor_id, true);
  UPDATE public.mercadolibre_payments SET status = 'VOIDED', voided_by = p_actor_id,
    void_reason = p_reason WHERE id = p_payment_id AND organization_id = p_org_id
      AND status = 'RECORDED';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobro no vigente'; END IF;
  IF current_setting('test.fail_void', true) = 'true' THEN
    RAISE EXCEPTION 'Falla comercial simulada';
  END IF;
  RETURN QUERY SELECT p_payment_id, false, 'VOIDED'::text;
END;
$$;
\ir ../migrations/20261123060000_mercadolibre_payment_reversal_reservations.sql

UPDATE public.organization_settings SET settings =
  '{"accounting_integration_enabled":true,"mercadolibre_accounting_enabled":true}'
  WHERE organization_id = md5('org')::uuid;

DO $$
DECLARE
  v_preparation uuid;
  v_reservation uuid;
  v_reversal_key uuid;
  v_second_key uuid;
  v_result record;
  v_failed boolean;
  v_payload jsonb := '{"amount":"5.00","currency":"ARS"}'::jsonb;
BEGIN
  SELECT id INTO v_preparation FROM public.mercadolibre_accounting_payment_preparations
    WHERE payment_id = md5('payment')::uuid AND status = 'PREPARED';
  IF has_table_privilege('service_role', 'public.mercadolibre_payment_reversal_reservations', 'INSERT')
    OR has_table_privilege('service_role', 'public.mercadolibre_payment_reversal_components', 'UPDATE')
    OR has_function_privilege('service_role',
      'public.reserve_meli_payment_reversal(uuid,uuid,uuid,uuid,uuid,date,text)', 'EXECUTE')
    OR has_function_privilege('service_role',
      'public.confirm_meli_payment_reversal_component(uuid,uuid,uuid,uuid,text,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('service_role',
      'public.finalize_meli_payment_reversal(uuid,uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.get_meli_payment_reversal_reservation(uuid,uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.get_meli_payment_reversal_reservation(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Reserva de reversión expuesta';
  END IF;
  PERFORM public.begin_meli_payment_dispatch(md5('org')::uuid, md5('owner')::uuid,
    v_preparation, 'manual:1', md5('pending-dispatch')::uuid, v_payload);
  v_failed := false;
  BEGIN
    PERFORM public.reserve_meli_payment_reversal(md5('org')::uuid, md5('owner')::uuid,
      md5('payment')::uuid, v_preparation, md5('reservation')::uuid, '2026-11-23', 'Carga errónea');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se reservó con un envío incierto'; END IF;
  PERFORM public.confirm_meli_payment_dispatch(md5('org')::uuid, md5('owner')::uuid,
    v_preparation, 'manual:1', md5('pending-dispatch')::uuid, v_payload, md5('entry-discount')::uuid);
  v_failed := false;
  BEGIN
    PERFORM public.reserve_meli_payment_reversal(md5('org')::uuid, md5('owner')::uuid,
      md5('payment')::uuid, v_preparation, md5('reservation')::uuid, '2026-11-20', 'Carga errónea');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una fecha anterior al cobro'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.reserve_meli_payment_reversal(md5('org')::uuid, md5('user')::uuid,
      md5('payment')::uuid, v_preparation, md5('reservation')::uuid, '2026-11-23', 'Carga errónea');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se reservó sin acceso al depósito'; END IF;

  UPDATE public.organization_settings SET settings = '{"accounting_integration_enabled":true}'
    WHERE organization_id = md5('org')::uuid;
  SELECT * INTO v_result FROM public.reserve_meli_payment_reversal(md5('org')::uuid,
    md5('owner')::uuid, md5('payment')::uuid, v_preparation,
    md5('reservation')::uuid, '2026-11-23', 'Carga errónea');
  v_reservation := v_result.reservation_id;
  IF v_result.idempotent OR (SELECT count(*) FROM public.mercadolibre_payment_reversal_components
    WHERE reservation_id = v_reservation) <> 2 THEN
    RAISE EXCEPTION 'Reserva inicial o componentes incorrectos';
  END IF;
  SELECT request_key INTO v_reversal_key FROM public.mercadolibre_payment_reversal_components
    WHERE reservation_id = v_reservation AND component_key = 'net'
      AND original_entry_id = md5('entry')::uuid;
  IF v_reversal_key IS NULL THEN RAISE EXCEPTION 'Falta clave durable de reversión'; END IF;
  SELECT * INTO v_result FROM public.reserve_meli_payment_reversal(md5('org')::uuid,
    md5('owner')::uuid, md5('payment')::uuid, v_preparation,
    md5('reservation')::uuid, '2026-11-23', 'Carga errónea');
  IF NOT v_result.idempotent OR v_result.reservation_id <> v_reservation
    OR NOT EXISTS (SELECT 1 FROM public.mercadolibre_payment_reversal_components
      WHERE reservation_id = v_reservation AND request_key = v_reversal_key) THEN
    RAISE EXCEPTION 'Reintento de reserva no idempotente';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.reserve_meli_payment_reversal(md5('org')::uuid, md5('owner')::uuid,
      md5('payment')::uuid, v_preparation, md5('reservation')::uuid, '2026-11-23', 'Otra razón');
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un payload distinto'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_meli_payment_reversal_reservation(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid)
    WHERE reservation_id = v_reservation AND jsonb_array_length(components) = 2
      AND reversal_date = '2026-11-23' AND created_by = md5('owner')::uuid
      AND reversal_description = 'Reversión cobro Meli: Carga errónea') THEN
    RAISE EXCEPTION 'No se recuperó la reserva completa';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_payment_reversal_reservation(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se leyó la reserva sin acceso al depósito'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.confirm_meli_payment_reversal_component(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid,
      v_reservation, 'net', md5('wrong-key')::uuid, md5('contra')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se confirmó una clave incorrecta'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.confirm_meli_payment_reversal_component(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid,
      v_reservation, 'net', v_reversal_key, md5('entry')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se usó el original como reversión'; END IF;
  SELECT * INTO v_result FROM public.confirm_meli_payment_reversal_component(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid,
    v_reservation, 'net', v_reversal_key, md5('contra')::uuid);
  IF v_result.idempotent THEN RAISE EXCEPTION 'Confirmación inicial repetida'; END IF;
  SELECT * INTO v_result FROM public.confirm_meli_payment_reversal_component(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid,
    v_reservation, 'net', v_reversal_key, md5('contra')::uuid);
  IF NOT v_result.idempotent THEN RAISE EXCEPTION 'Confirmación no idempotente'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.confirm_meli_payment_reversal_component(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid,
      v_reservation, 'net', v_reversal_key, md5('different-contra')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una segunda reversión'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.finalize_meli_payment_reversal(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_reservation);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se finalizó con una reversión pendiente'; END IF;
  IF (SELECT status FROM public.mercadolibre_payments WHERE id = md5('payment')::uuid) <> 'RECORDED' THEN
    RAISE EXCEPTION 'La finalización parcial modificó el cobro';
  END IF;

  UPDATE public.organization_settings SET settings =
    '{"accounting_integration_enabled":true,"mercadolibre_accounting_enabled":true}'
    WHERE organization_id = md5('org')::uuid;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_payment_dispatch(md5('org')::uuid, md5('owner')::uuid,
      v_preparation, 'manual:2', md5('blocked-dispatch')::uuid, v_payload);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió un nuevo envío durante reversión'; END IF;
  v_failed := false;
  BEGIN
    UPDATE public.mercadolibre_payments SET status = 'VOIDED' WHERE id = md5('payment')::uuid;
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se anuló el cobro antes de revertir los asientos'; END IF;
  SELECT request_key INTO v_second_key FROM public.mercadolibre_payment_reversal_components
    WHERE reservation_id = v_reservation AND component_key = 'manual:1';
  PERFORM public.confirm_meli_payment_reversal_component(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid,
    v_reservation, 'manual:1', v_second_key, md5('contra-second')::uuid);
  v_failed := false;
  BEGIN
    PERFORM public.void_mercadolibre_payment(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, 'Carga errónea');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se omitió el finalizador contable'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.finalize_meli_payment_reversal(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, v_reservation);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se finalizó sin acceso al depósito'; END IF;
  PERFORM set_config('test.fail_void', 'true', true);
  v_failed := false;
  BEGIN
    PERFORM public.finalize_meli_payment_reversal(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_reservation);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed OR (SELECT status FROM public.mercadolibre_payments
    WHERE id = md5('payment')::uuid) <> 'RECORDED'
    OR (SELECT status FROM public.mercadolibre_payment_reversal_reservations
      WHERE id = v_reservation) <> 'RESERVED' THEN
    RAISE EXCEPTION 'La falla comercial no revirtió la finalización';
  END IF;
  PERFORM set_config('test.fail_void', 'false', true);
  SELECT * INTO v_result FROM public.finalize_meli_payment_reversal(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_reservation);
  IF v_result.idempotent OR v_result.payment_id <> md5('payment')::uuid
    OR NOT EXISTS (SELECT 1 FROM public.mercadolibre_payments
      WHERE id = md5('payment')::uuid AND status = 'VOIDED'
        AND voided_by = md5('owner')::uuid AND void_reason = 'Carga errónea')
    OR NOT EXISTS (SELECT 1 FROM public.mercadolibre_payment_reversal_reservations
      WHERE id = v_reservation AND status = 'VOIDED'
        AND finalized_by = md5('owner')::uuid AND finalized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'No se finalizó la anulación contable y comercial';
  END IF;
  SELECT * INTO v_result FROM public.finalize_meli_payment_reversal(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_reservation);
  IF NOT v_result.idempotent THEN RAISE EXCEPTION 'Finalización no idempotente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_meli_payment_reversal_reservation(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid)
    WHERE status = 'VOIDED' AND payment_status = 'VOIDED'
      AND finalized_by = md5('owner')::uuid AND finalized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'No se recuperó la finalización';
  END IF;
END;
$$;
