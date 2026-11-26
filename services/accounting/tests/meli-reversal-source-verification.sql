-- Run only against an empty disposable database after 001, 002, 006 and 024-030.
BEGIN;
INSERT INTO accounting.chart_of_accounts
  (id, org_id, codigo, nombre, tipo, naturaleza, moneda)
VALUES
  (md5('debit')::uuid, md5('org')::uuid, '1', 'Debit', 'ACTIVO', 'DEUDORA', 'AMBAS'),
  (md5('credit')::uuid, md5('org')::uuid, '2', 'Credit', 'ACTIVO', 'DEUDORA', 'AMBAS');
INSERT INTO accounting.meli_posting_periods (org_id, period_start, status, changed_by)
VALUES (md5('org')::uuid, '2026-01-01', 'OPEN', md5('actor')::uuid);

DO $$
DECLARE
  v_lines jsonb := jsonb_build_array(
    jsonb_build_object('accountId', md5('debit')::uuid, 'side', 'DEBE',
      'originalAmount', '1.00', 'pesosAmount', '1325.75'),
    jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER',
      'originalAmount', '1.00', 'pesosAmount', '1325.75')
  );
  v_payload jsonb;
  v_original uuid;
  v_reversal uuid;
  v_result record;
  v_failed boolean;
BEGIN
  v_original := accounting.create_meli_journal_entry(
    md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
    md5('journal-key')::uuid, '2026-01-01', 'Cobro', md5('actor')::uuid,
    'USD', 1325.75, v_lines);
  SELECT payload INTO v_payload FROM accounting.meli_journal_requests
    WHERE request_key = md5('journal-key')::uuid;
  SELECT * INTO v_result FROM accounting.verify_meli_payment_reversal_source(
    md5('org')::uuid, v_original, md5('journal-key')::uuid, v_payload,
    md5('reverse-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid);
  IF v_result.original_entry_id IS DISTINCT FROM v_original OR v_result.reversal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se verificó el original sin reversión';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_verified_meli_payment(
      md5('org')::uuid, v_original, md5('journal-key')::uuid,
      v_payload || '{"description":"Alterado"}'::jsonb,
      md5('reverse-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true; END;
  IF NOT v_failed OR EXISTS (SELECT 1 FROM accounting.meli_payment_reversals
    WHERE request_key = md5('reverse-key')::uuid) THEN
    RAISE EXCEPTION 'Se creó una reversión con fuente inválida';
  END IF;
  v_reversal := accounting.reverse_verified_meli_payment(
    md5('org')::uuid, v_original, md5('journal-key')::uuid, v_payload,
    md5('reverse-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid);
  IF accounting.reverse_verified_meli_payment(
    md5('org')::uuid, v_original, md5('journal-key')::uuid, v_payload,
    md5('reverse-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid)
    IS DISTINCT FROM v_reversal THEN
    RAISE EXCEPTION 'El reintento de reversión no fue idempotente';
  END IF;
  SELECT * INTO v_result FROM accounting.verify_meli_payment_reversal_source(
    md5('org')::uuid, v_original, md5('journal-key')::uuid, v_payload,
    md5('reverse-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid);
  IF v_result.original_entry_id IS DISTINCT FROM v_original
    OR v_result.reversal_entry_id IS DISTINCT FROM v_reversal THEN
    RAISE EXCEPTION 'No se verificaron el original y su reversión';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.verify_meli_payment_reversal_source(
      md5('org')::uuid, v_original, md5('journal-key')::uuid, v_payload,
      md5('other-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió una reversión inesperada'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.verify_meli_payment_reversal_source(
      md5('org')::uuid, v_original, md5('journal-key')::uuid,
      v_payload || '{"description":"Otra"}'::jsonb,
      md5('reverse-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió un payload distinto'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.verify_meli_payment_reversal_source(
      md5('other-org')::uuid, v_original, md5('journal-key')::uuid, v_payload,
      md5('reverse-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió otra organización'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.verify_meli_payment_reversal_source(
      md5('org')::uuid, v_original, md5('journal-key')::uuid,
      v_payload || '{"originType":"invoice"}'::jsonb,
      md5('reverse-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió una fuente que no es cobro'; END IF;
  IF has_function_privilege('authenticated',
    'accounting.verify_meli_payment_reversal_source(uuid,uuid,uuid,jsonb,uuid,date,text,uuid)',
    'EXECUTE') THEN RAISE EXCEPTION 'La función interna no debe ser pública'; END IF;
  UPDATE accounting.journal_entry_lines SET monto_origen = 2
    WHERE journal_entry_id = v_original AND cuenta_id = md5('debit')::uuid;
  UPDATE accounting.journal_entry_lines SET monto_origen = 2
    WHERE journal_entry_id = v_reversal AND cuenta_id = md5('debit')::uuid;
  v_failed := false;
  BEGIN
    PERFORM accounting.verify_meli_payment_reversal_source(
      md5('org')::uuid, v_original, md5('journal-key')::uuid, v_payload,
      md5('reverse-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitieron líneas alteradas en ambos asientos'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_verified_meli_payment(
      md5('org')::uuid, v_original, md5('journal-key')::uuid, v_payload,
      md5('reverse-key')::uuid, '2026-01-02', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un original alterado al reintentar'; END IF;
END;
$$;
ROLLBACK;
