-- Run only in a new disposable PostgreSQL instance; this creates roles and fixtures.
\set ON_ERROR_STOP on
\ir mercadolibre-accounting-payment-dispatch-foundation.sql
\ir ../migrations/20261123010000_mercadolibre_accounting_preparation_read.sql

DO $$
DECLARE
  v_preparation uuid;
  v_result record;
  v_failed boolean;
BEGIN
  SELECT id INTO v_preparation FROM public.mercadolibre_accounting_payment_preparations
    WHERE idempotency_key = md5('dispatch-prepare')::uuid;
  SELECT * INTO v_result FROM public.list_meli_payment_accounting_preparations(
    md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid)
    WHERE id = v_preparation;
  IF v_result.status <> 'PREPARED' OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result.components) c
    WHERE c->>'key' = 'net' AND c->>'dispatchStatus' = 'PUBLISHED'
      AND c->>'journalEntryId' = md5('entry')::uuid::text
  ) THEN RAISE EXCEPTION 'No se recuperó la preparación publicada con el flag deshabilitado'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result.components) c
    WHERE c->>'key' = 'manual:1' AND c->'dispatchStatus' = 'null'::jsonb
  ) THEN RAISE EXCEPTION 'No se recuperaron los componentes pendientes'; END IF;
  IF has_function_privilege('authenticated',
    'public.list_meli_payment_accounting_preparations(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'La consulta no debe estar expuesta a clientes autenticados';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.list_meli_payment_accounting_preparations(
      md5('other-org')::uuid, md5('owner')::uuid, md5('payment')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un cobro de otra organización'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.list_meli_payment_accounting_preparations(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un usuario sin depósito'; END IF;
END;
$$;
