-- Run only in an empty disposable database with psql.
\set ON_ERROR_STOP on
\ir mercadolibre-accounting-payment-preparations.sql
\ir ../migrations/20261122220000_mercadolibre_accounting_payment_dispatch_foundation.sql

UPDATE public.mercadolibre_payments SET status = 'RECORDED';

DO $$
DECLARE
  v_draft uuid;
  v_preparation uuid;
  v_result record;
  v_failed boolean;
  v_payload jsonb := '{"amount":"100.00","currency":"ARS"}'::jsonb;
BEGIN
  IF has_table_privilege('service_role', 'public.mercadolibre_accounting_payment_dispatches', 'INSERT')
    OR has_function_privilege('service_role',
      'public.begin_meli_payment_dispatch(uuid,uuid,uuid,text,uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.confirm_meli_payment_dispatch(uuid,uuid,uuid,text,uuid,jsonb,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'La base de envíos no debe estar expuesta';
  END IF;
  SELECT id INTO v_draft FROM public.mercadolibre_accounting_breakdown_drafts
    WHERE payment_id = md5('payment')::uuid AND active;
  SELECT preparation_id INTO v_preparation FROM public.prepare_meli_accounting_payment(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_draft, md5('dispatch-prepare')::uuid);

  SELECT * INTO v_result FROM public.begin_meli_payment_dispatch(
    md5('org')::uuid, md5('owner')::uuid, v_preparation, 'net', md5('dispatch')::uuid, v_payload);
  IF v_result.idempotent OR v_result.dispatch_status <> 'UNCERTAIN'
    OR v_result.journal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'El envío no comenzó en estado incierto';
  END IF;
  SELECT * INTO v_result FROM public.begin_meli_payment_dispatch(
    md5('org')::uuid, md5('owner')::uuid, v_preparation, 'net', md5('dispatch')::uuid, v_payload);
  IF NOT v_result.idempotent OR v_result.dispatch_status <> 'UNCERTAIN' THEN
    RAISE EXCEPTION 'El reintento no recuperó el estado incierto';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_payment_dispatch(
      md5('org')::uuid, md5('owner')::uuid, v_preparation, 'net', md5('dispatch')::uuid, '{"amount":"99"}');
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un payload distinto con la misma clave'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_payment_dispatch(
      md5('org')::uuid, md5('owner')::uuid, v_preparation, 'net', md5('other-dispatch')::uuid, v_payload);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una clave distinta para el componente'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_payment_dispatch(
      md5('other-org')::uuid, md5('owner')::uuid, v_preparation, 'net', md5('dispatch')::uuid, v_payload);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó otra organización'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_payment_dispatch(
      md5('org')::uuid, md5('user')::uuid, v_preparation, 'net', md5('dispatch')::uuid, v_payload);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un usuario sin depósito'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.cancel_meli_accounting_payment_preparation(
      md5('org')::uuid, md5('owner')::uuid, v_preparation);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se canceló una preparación con envío incierto'; END IF;
  v_failed := false;
  BEGIN
    UPDATE public.mercadolibre_payments SET status = 'VOIDED' WHERE id = md5('payment')::uuid;
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se anuló un cobro con envío incierto'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, md5('new-after-dispatch')::uuid, 3,
      '{"net":"80","discount":"5","commission":"10","shipping":"5"}', '');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se modificó el desglose con envío incierto'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.confirm_meli_payment_dispatch(
      md5('org')::uuid, md5('owner')::uuid, v_preparation, 'net',
      md5('dispatch')::uuid, '{"amount":"99"}', md5('entry')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se confirmó un payload distinto'; END IF;

  UPDATE public.organization_settings SET settings = '{"accounting_integration_enabled":true}'
    WHERE organization_id = md5('org')::uuid;
  SELECT * INTO v_result FROM public.confirm_meli_payment_dispatch(
    md5('org')::uuid, md5('owner')::uuid, v_preparation, 'net',
    md5('dispatch')::uuid, v_payload, md5('entry')::uuid);
  IF v_result.idempotent OR v_result.dispatch_status <> 'PUBLISHED'
    OR v_result.journal_entry_id <> md5('entry')::uuid THEN
    RAISE EXCEPTION 'No se confirmó la publicación durante recuperación';
  END IF;
  SELECT * INTO v_result FROM public.confirm_meli_payment_dispatch(
    md5('org')::uuid, md5('owner')::uuid, v_preparation, 'net',
    md5('dispatch')::uuid, v_payload, md5('entry')::uuid);
  IF NOT v_result.idempotent THEN RAISE EXCEPTION 'La confirmación no fue idempotente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_dispatches
    WHERE preparation_id = v_preparation AND component_key = 'net'
      AND published_by = md5('owner')::uuid AND published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'No se conservó la auditoría de confirmación';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.confirm_meli_payment_dispatch(
      md5('org')::uuid, md5('owner')::uuid, v_preparation, 'net',
      md5('dispatch')::uuid, v_payload, md5('other-entry')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó otro asiento para el envío'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.cancel_meli_accounting_payment_preparation(
      md5('org')::uuid, md5('owner')::uuid, v_preparation);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se canceló una preparación publicada'; END IF;
END;
$$;
