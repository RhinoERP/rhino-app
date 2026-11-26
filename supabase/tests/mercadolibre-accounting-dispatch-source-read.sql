-- Run only in a new disposable instance; included fixtures create roles.
\set ON_ERROR_STOP on
\ir mercadolibre-accounting-dispatch-recovery-read.sql
\ir ../migrations/20261123030000_mercadolibre_accounting_dispatch_source_read.sql
\ir ../migrations/20261123100000_meli_payment_dispatch_source_before_publication.sql

DO $$
DECLARE v_preparation uuid; v_result record; v_failed boolean;
BEGIN
  SELECT id INTO v_preparation FROM public.mercadolibre_accounting_payment_preparations
    WHERE idempotency_key = md5('dispatch-prepare')::uuid;
  SELECT * INTO v_result FROM public.get_meli_payment_dispatch_source(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_preparation, 'net');
  IF v_result.sale_id IS DISTINCT FROM md5('sale')::uuid
    OR v_result.payment_date IS DISTINCT FROM '2026-11-21'::date
    OR v_result.currency IS DISTINCT FROM 'ARS'
    OR v_result.payment_status IS DISTINCT FROM 'RECORDED'
    OR v_result.preparation_status IS DISTINCT FROM 'PREPARED'
    OR v_result.component_amount::numeric IS DISTINCT FROM 100::numeric
    OR v_result.debit_account->>'code' IS DISTINCT FROM 'MERCADO_PAGO'
    OR v_result.credit_account->>'code' IS DISTINCT FROM 'AR_DEUDORES_VENTAS' THEN
    RAISE EXCEPTION 'Fuente de despacho incorrecta';
  END IF;
  INSERT INTO public.mercadolibre_accounting_payment_preparation_components
    (preparation_id, component_key, description, amount, debit_account, credit_account)
    SELECT preparation_id, 'not-dispatched', description, amount, debit_account, credit_account
    FROM public.mercadolibre_accounting_payment_preparation_components
    WHERE preparation_id = v_preparation AND component_key = 'net';
  SELECT * INTO v_result FROM public.get_meli_payment_dispatch_source(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid,
    v_preparation, 'not-dispatched');
  IF v_result.sale_id IS DISTINCT FROM md5('sale')::uuid
    OR v_result.component_amount::numeric IS DISTINCT FROM 100::numeric THEN
    RAISE EXCEPTION 'No se obtuvo la fuente del componente sin despacho';
  END IF;
  IF has_function_privilege('authenticated',
    'public.get_meli_payment_dispatch_source(uuid,uuid,uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
    'public.get_meli_payment_dispatch_source(uuid,uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Lectura expuesta a clientes autenticados';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_payment_dispatch_source(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, v_preparation, 'net');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un actor sin depósito'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_payment_dispatch_source(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid,
      v_preparation, 'not-dispatched');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un actor sin depósito antes del despacho'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_payment_dispatch_source(
      md5('other-org')::uuid, md5('owner')::uuid, md5('payment')::uuid, v_preparation, 'net');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una organización ajena'; END IF;
END;
$$;
