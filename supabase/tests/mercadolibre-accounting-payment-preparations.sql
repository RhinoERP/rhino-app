-- Run in an empty disposable database with psql, never against production.
\set ON_ERROR_STOP on
\ir mercadolibre-accounting-breakdown-drafts.sql
\ir ../migrations/20261121210000_mercadolibre_accounting_payment_preparations.sql

UPDATE public.organization_settings SET settings =
  '{"accounting_integration_enabled":true,"mercadolibre_accounting_enabled":true}';
UPDATE public.mercadolibre_payments SET status = 'RECORDED';

DO $$
DECLARE
  v_draft uuid;
  v_preparation uuid;
  v_second uuid;
  v_result record;
  v_failed boolean;
  v_counterpart jsonb := '{"kind":"semantic","code":"AR_DEUDORES_VENTAS"}';
BEGIN
  IF has_table_privilege('service_role', 'public.mercadolibre_accounting_payment_preparations', 'INSERT')
    OR has_table_privilege('service_role', 'public.mercadolibre_accounting_payment_preparation_components', 'INSERT')
    OR has_function_privilege('authenticated', 'public.prepare_meli_accounting_payment(uuid,uuid,uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'La preparación no debe admitir escritura directa o RPC autenticada';
  END IF;
  SELECT id INTO v_draft FROM public.mercadolibre_accounting_breakdown_drafts
    WHERE payment_id = md5('payment')::uuid AND active;
  SELECT * INTO v_result FROM public.prepare_meli_accounting_payment(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_draft, md5('prepare')::uuid);
  v_preparation := v_result.preparation_id;
  IF v_result.idempotent OR v_result.preparation_status <> 'PREPARED' THEN
    RAISE EXCEPTION 'Preparación inicial incorrecta';
  END IF;
  IF (SELECT count(*) FROM public.mercadolibre_accounting_payment_preparation_components
    WHERE preparation_id = v_preparation) <> 5 OR
    NOT EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_preparation_components
      WHERE preparation_id = v_preparation AND component_key = 'net' AND amount = 78
        AND debit_account = '{"kind":"semantic","code":"MERCADO_PAGO"}'::jsonb
        AND credit_account = v_counterpart) OR
    NOT EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_preparation_components
      WHERE preparation_id = v_preparation AND component_key = 'manual:1' AND amount = 2
        AND debit_account = '{"kind":"manual","id":"00000000-0000-4000-8000-000000000001"}'::jsonb
        AND credit_account = v_counterpart) THEN
    RAISE EXCEPTION 'Los componentes no reflejan el desglose persistido';
  END IF;
  SELECT * INTO v_result FROM public.prepare_meli_accounting_payment(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_draft, md5('prepare')::uuid);
  IF NOT v_result.idempotent OR v_result.preparation_id <> v_preparation THEN
    RAISE EXCEPTION 'No se recuperó la preparación idempotente';
  END IF;
  IF (SELECT count(*) FROM public.mercadolibre_accounting_payment_preparation_components c
    JOIN (VALUES
      ('discount', 5::numeric, 'DESCUENTOS_OTORGADOS'),
      ('commission', 10::numeric, 'COMISIONES_POR_VENTAS'),
      ('shipping', 5::numeric, 'VIATICOS')
    ) AS expected(component_key, amount, code)
      ON c.component_key = expected.component_key AND c.amount = expected.amount
      AND c.debit_account = jsonb_build_object('kind', 'semantic', 'code', expected.code)
    WHERE c.preparation_id = v_preparation AND c.credit_account = v_counterpart) <> 3 THEN
    RAISE EXCEPTION 'Los componentes fijos no corresponden a sus cuentas e importes';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.prepare_meli_accounting_payment(md5('org')::uuid, md5('user')::uuid,
      md5('payment')::uuid, v_draft, md5('no-warehouse')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se preparó sin acceso al depósito'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.prepare_meli_accounting_payment(md5('org')::uuid, md5('owner')::uuid,
      md5('payment')::uuid, md5('different-draft')::uuid, md5('prepare')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una clave con otro desglose'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.prepare_meli_accounting_payment(md5('org')::uuid, md5('owner')::uuid,
      md5('payment')::uuid, v_draft, md5('other-key')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptaron dos preparaciones activas'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(md5('org')::uuid, md5('owner')::uuid,
      md5('payment')::uuid, md5('new-draft')::uuid, 2,
      '{"net":"80","discount":"5","commission":"10","shipping":"5"}', '');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se reemplazó un desglose preparado'; END IF;
  v_failed := false;
  BEGIN
    UPDATE public.mercadolibre_payments SET status = 'VOIDED' WHERE id = md5('payment')::uuid;
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se anuló un cobro con preparación activa'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.cancel_meli_accounting_payment_preparation(
      md5('other-org')::uuid, md5('owner')::uuid, v_preparation);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se canceló una preparación de otra organización'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.cancel_meli_accounting_payment_preparation(
      md5('org')::uuid, md5('user')::uuid, v_preparation);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se canceló una preparación sin acceso al depósito'; END IF;
  UPDATE public.organization_settings SET settings = '{"accounting_integration_enabled":true}'
    WHERE organization_id = md5('org')::uuid;
  v_failed := false;
  BEGIN
    PERFORM public.prepare_meli_accounting_payment(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_draft, md5('prepare')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se preparó con la integración deshabilitada'; END IF;
  SELECT * INTO v_result FROM public.cancel_meli_accounting_payment_preparation(
    md5('org')::uuid, md5('owner')::uuid, v_preparation);
  IF v_result.idempotent THEN RAISE EXCEPTION 'Cancelación inicial marcada como repetida'; END IF;
  SELECT * INTO v_result FROM public.cancel_meli_accounting_payment_preparation(
    md5('org')::uuid, md5('owner')::uuid, v_preparation);
  IF NOT v_result.idempotent THEN RAISE EXCEPTION 'La cancelación no es idempotente'; END IF;
  UPDATE public.organization_settings SET settings =
    '{"accounting_integration_enabled":true,"mercadolibre_accounting_enabled":true}'
    WHERE organization_id = md5('org')::uuid;
  SELECT * INTO v_result FROM public.prepare_meli_accounting_payment(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_draft, md5('prepare')::uuid);
  IF NOT v_result.idempotent OR v_result.preparation_status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'El reintento reactivó una preparación cancelada';
  END IF;
  SELECT draft_id INTO v_draft FROM public.save_meli_accounting_breakdown_draft(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, md5('new-draft')::uuid, 2,
    '{"net":"100","discount":"0","commission":"0","shipping":"0","manualConcepts":[{"description":"Resta","accountId":"00000000-0000-4000-8000-000000000001","amount":"2","direction":"SUBTRACT"},{"description":"Suma","accountId":"00000000-0000-4000-8000-000000000002","amount":"2","direction":"ADD"}]}', '');
  SELECT preparation_id INTO v_second FROM public.prepare_meli_accounting_payment(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_draft, md5('prepare2')::uuid);
  IF (SELECT count(*) FROM public.mercadolibre_accounting_payment_preparation_components
    WHERE preparation_id = v_second) <> 3 OR
    NOT EXISTS (SELECT 1 FROM public.mercadolibre_accounting_payment_preparation_components
      WHERE preparation_id = v_second AND component_key = 'manual:1' AND amount = 2
        AND debit_account = v_counterpart
        AND credit_account = '{"kind":"manual","id":"00000000-0000-4000-8000-000000000001"}'::jsonb) THEN
    RAISE EXCEPTION 'Los componentes cero o de resta no se prepararon correctamente';
  END IF;
  PERFORM public.cancel_meli_accounting_payment_preparation(md5('org')::uuid, md5('owner')::uuid, v_second);
  UPDATE public.mercadolibre_payments SET status = 'VOIDED' WHERE id = md5('payment')::uuid;
  v_failed := false;
  BEGIN
    PERFORM public.prepare_meli_accounting_payment(md5('org')::uuid, md5('owner')::uuid,
      md5('payment')::uuid, v_draft, md5('voided')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se preparó un cobro anulado'; END IF;
END;
$$;
