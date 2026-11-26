-- Run only in a new disposable PostgreSQL instance; this creates roles and fixtures.
\set ON_ERROR_STOP on
\ir mercadolibre-accounting-preparation-read.sql
\ir ../migrations/20261123020000_mercadolibre_accounting_dispatch_recovery_read.sql

DO $$
DECLARE
  v_preparation uuid;
  v_result record;
  v_failed boolean;
BEGIN
  SELECT id INTO v_preparation FROM public.mercadolibre_accounting_payment_preparations
    WHERE idempotency_key = md5('dispatch-prepare')::uuid;
  SELECT * INTO v_result FROM public.get_meli_payment_dispatch_for_recovery(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_preparation, 'net');
  IF v_result.request_key IS DISTINCT FROM md5('dispatch')::uuid
    OR v_result.request_payload IS DISTINCT FROM '{"amount":"100.00","currency":"ARS"}'::jsonb
    OR v_result.dispatch_status IS DISTINCT FROM 'PUBLISHED'
    OR v_result.journal_entry_id IS DISTINCT FROM md5('entry')::uuid
    OR v_result.initiated_by IS DISTINCT FROM md5('owner')::uuid THEN
    RAISE EXCEPTION 'No se recuperó la solicitud y su auditoría con el flag apagado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_meli_payment_dispatch_for_recovery(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_preparation, 'manual:1')) THEN
    RAISE EXCEPTION 'Se inventó un envío para un componente sin despacho';
  END IF;
  INSERT INTO public.mercadolibre_accounting_payment_dispatches
    (preparation_id, component_key, request_key, request_payload, status, initiated_by)
    VALUES (v_preparation, 'manual:1', md5('uncertain')::uuid,
      '{"marker":"immutable"}'::jsonb, 'UNCERTAIN', md5('owner')::uuid);
  SELECT * INTO v_result FROM public.get_meli_payment_dispatch_for_recovery(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_preparation, 'manual:1');
  IF v_result.request_key IS DISTINCT FROM md5('uncertain')::uuid
    OR v_result.request_payload IS DISTINCT FROM '{"marker":"immutable"}'::jsonb
    OR v_result.dispatch_status IS DISTINCT FROM 'UNCERTAIN'
    OR v_result.journal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se recuperó la solicitud incierta';
  END IF;
  IF has_function_privilege('authenticated',
    'public.get_meli_payment_dispatch_for_recovery(uuid,uuid,uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
    'public.get_meli_payment_dispatch_for_recovery(uuid,uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Permisos de recuperación incorrectos';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_payment_dispatch_for_recovery(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, v_preparation, 'net');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un usuario sin depósito'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_payment_dispatch_for_recovery(
      md5('org')::uuid, md5('owner')::uuid, md5('other-payment')::uuid, v_preparation, 'net');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un cobro ajeno'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_payment_dispatch_for_recovery(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_preparation, 'unknown');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un componente ajeno'; END IF;
END;
$$;
