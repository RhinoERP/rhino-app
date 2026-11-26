-- Run only against an empty disposable PostgreSQL instance; creates roles and fixtures.
\set ON_ERROR_STOP on
\ir mercadolibre-fiscal-accounting-preparations.sql
\ir ../migrations/20261123050000_mercadolibre_fiscal_dispatch_foundation.sql

UPDATE public.sales_orders SET arca_request_json = '{"wsfeRequest":{"ImpTotal":100}}'
  WHERE id = md5('sale')::uuid;
UPDATE public.credit_notes SET arca_associated_voucher_number = 42
  WHERE id = md5('note')::uuid;

DO $$
DECLARE
  v_invoice uuid;
  v_note uuid;
  v_payload jsonb;
  v_note_payload jsonb;
  v_result record;
  v_failed boolean;
BEGIN
  SELECT id INTO v_invoice FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE origin_type = 'invoice';
  SELECT id INTO v_note FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE origin_type = 'creditNote';
  v_payload := jsonb_build_object(
    'orgId', md5('org')::uuid, 'originType', 'invoice', 'originId', md5('sale')::uuid,
    'componentKey', 'fiscal', 'requestKey', md5('key')::uuid,
    'actorId', md5('owner')::uuid, 'currency', 'ARS', 'date', '2026-11-23',
    'exchangeRate', '1', 'description', 'Original',
    'lines', jsonb_build_array(
      jsonb_build_object('accountId', md5('debt')::uuid, 'side', 'DEBE',
        'originalAmount', '100', 'pesosAmount', '100'),
      jsonb_build_object('accountId', md5('sales')::uuid, 'side', 'HABER',
        'originalAmount', '100', 'pesosAmount', '100'))
  );
  v_note_payload := jsonb_build_object(
    'orgId', md5('org')::uuid, 'originType', 'creditNote', 'originId', md5('note')::uuid,
    'componentKey', 'fiscal', 'requestKey', md5('note-key')::uuid,
    'actorId', md5('owner')::uuid, 'currency', 'ARS', 'date', '2026-11-23',
    'exchangeRate', '1', 'description', 'Nota',
    'lines', jsonb_build_array(
      jsonb_build_object('accountId', md5('sales')::uuid, 'side', 'DEBE',
        'originalAmount', '20', 'pesosAmount', '20'),
      jsonb_build_object('accountId', md5('debt')::uuid, 'side', 'HABER',
        'originalAmount', '20', 'pesosAmount', '20'))
  );
  IF has_table_privilege('service_role', 'public.mercadolibre_fiscal_accounting_dispatches', 'INSERT')
    OR has_function_privilege('service_role',
      'public.begin_meli_fiscal_dispatch(uuid,uuid,uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('service_role',
      'public.confirm_meli_fiscal_dispatch(uuid,uuid,uuid,uuid,jsonb,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.get_meli_fiscal_dispatch_for_recovery(uuid,uuid,uuid,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.get_meli_fiscal_dispatch_for_recovery(uuid,uuid,uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Permisos de despacho fiscal incorrectos';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_fiscal_dispatch(md5('org')::uuid, md5('owner')::uuid,
      v_invoice, v_payload || '{"currency":"USD"}'::jsonb);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió moneda incorrecta'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_fiscal_dispatch(md5('org')::uuid, md5('owner')::uuid,
      v_invoice, v_payload || '{"lines":[]}'::jsonb);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió un asiento sin líneas'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_fiscal_dispatch(md5('org')::uuid, md5('owner')::uuid,
      v_invoice, v_payload || '{"exchangeRate":"2"}'::jsonb);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió una tasa ARS incorrecta'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_fiscal_dispatch(md5('org')::uuid, md5('owner')::uuid,
      v_invoice, v_payload || jsonb_build_object('lines', jsonb_build_array(
        jsonb_build_object('accountId', 'invalid', 'side', 'DEBE',
          'originalAmount', '100', 'pesosAmount', '100'),
        jsonb_build_object('accountId', md5('sales')::uuid, 'side', 'HABER',
          'originalAmount', '100', 'pesosAmount', '100'))));
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió una línea inválida'; END IF;
  IF EXISTS (SELECT 1 FROM public.mercadolibre_fiscal_accounting_dispatches) THEN
    RAISE EXCEPTION 'Se guardó un despacho inválido';
  END IF;

  SELECT * INTO v_result FROM public.begin_meli_fiscal_dispatch(
    md5('org')::uuid, md5('owner')::uuid, v_invoice, v_payload);
  IF v_result.dispatch_status <> 'UNCERTAIN' OR v_result.idempotent
    OR v_result.journal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Estado inicial incorrecto';
  END IF;
  SELECT * INTO v_result FROM public.begin_meli_fiscal_dispatch(
    md5('org')::uuid, md5('owner')::uuid, v_invoice, v_payload);
  IF NOT v_result.idempotent OR v_result.dispatch_status <> 'UNCERTAIN' THEN
    RAISE EXCEPTION 'Reintento de envío incorrecto';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_fiscal_dispatch(md5('org')::uuid, md5('owner')::uuid,
      v_invoice, v_payload || '{"description":"Alterado"}'::jsonb);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un payload distinto'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_fiscal_dispatch(md5('org')::uuid, md5('user')::uuid,
      v_invoice, v_payload);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Otro usuario inició la preparación'; END IF;

  UPDATE public.sales_orders SET arca_request_json = '{"changed":true}'
    WHERE id = md5('sale')::uuid;
  v_failed := false;
  BEGIN
    PERFORM public.begin_meli_fiscal_dispatch(md5('org')::uuid, md5('owner')::uuid,
      v_invoice, v_payload);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una fuente fiscal alterada'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_meli_fiscal_dispatch_for_recovery(
      md5('org')::uuid, md5('owner')::uuid, md5('sale')::uuid, 'invoice', md5('sale')::uuid)
    WHERE request_key = md5('key')::uuid AND request_payload = v_payload
      AND dispatch_status = 'UNCERTAIN'
  ) THEN RAISE EXCEPTION 'No se recuperó la solicitud durable'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_fiscal_dispatch_for_recovery(
      md5('org')::uuid, md5('user')::uuid, md5('sale')::uuid, 'invoice', md5('sale')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Lectura sin acceso al depósito'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_fiscal_dispatch_for_recovery(
      md5('other-org')::uuid, md5('owner')::uuid, md5('sale')::uuid, 'invoice', md5('sale')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Lectura desde otra organización'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.confirm_meli_fiscal_dispatch(md5('org')::uuid, md5('owner')::uuid,
      v_invoice, md5('key')::uuid, v_payload || '{"description":"Alterado"}'::jsonb,
      md5('entry')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Confirmación con payload distinto'; END IF;
  SELECT * INTO v_result FROM public.confirm_meli_fiscal_dispatch(
    md5('org')::uuid, md5('owner')::uuid, v_invoice, md5('key')::uuid,
    v_payload, md5('entry')::uuid);
  IF v_result.dispatch_status <> 'PUBLISHED' OR v_result.idempotent THEN
    RAISE EXCEPTION 'Confirmación fiscal incorrecta';
  END IF;
  SELECT * INTO v_result FROM public.confirm_meli_fiscal_dispatch(
    md5('org')::uuid, md5('owner')::uuid, v_invoice, md5('key')::uuid,
    v_payload, md5('entry')::uuid);
  IF NOT v_result.idempotent THEN RAISE EXCEPTION 'Confirmación no idempotente'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.confirm_meli_fiscal_dispatch(md5('org')::uuid, md5('owner')::uuid,
      v_invoice, md5('key')::uuid, v_payload, md5('other-entry')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó otro asiento'; END IF;

  UPDATE public.sales_orders SET arca_request_json = '{"wsfeRequest":{"ImpTotal":100}}'
    WHERE id = md5('sale')::uuid;
  SELECT * INTO v_result FROM public.begin_meli_fiscal_dispatch(
    md5('org')::uuid, md5('owner')::uuid, v_note, v_note_payload);
  IF v_result.dispatch_status <> 'UNCERTAIN' OR v_result.idempotent THEN
    RAISE EXCEPTION 'No se preparó el envío de la nota';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.confirm_meli_fiscal_dispatch(md5('org')::uuid, md5('owner')::uuid,
      v_note, md5('note-key')::uuid, v_note_payload, md5('entry')::uuid);
  EXCEPTION WHEN unique_violation THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se compartió un asiento entre comprobantes'; END IF;
END;
$$;
