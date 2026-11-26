-- Run only against an empty disposable database after 001, 002, 006 and 024-028.
BEGIN;
INSERT INTO accounting.chart_of_accounts
  (id, org_id, codigo, nombre, tipo, naturaleza, moneda)
VALUES
  (md5('debit')::uuid, md5('org')::uuid, '1', 'Debit', 'ACTIVO', 'DEUDORA', 'AMBAS'),
  (md5('credit')::uuid, md5('org')::uuid, '2', 'Credit', 'ACTIVO', 'DEUDORA', 'AMBAS');

DO $$
DECLARE
  v_lines jsonb := jsonb_build_array(
    jsonb_build_object('accountId', md5('debit')::uuid, 'side', 'DEBE',
      'originalAmount', '1.00', 'pesosAmount', '1325.75'),
    jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER',
      'originalAmount', '1.00', 'pesosAmount', '1325.75')
  );
  v_entry uuid;
  v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
      md5('key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
      'USD', 1325.75, v_lines);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%período contable Meli%' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió un período no configurado'; END IF;

  INSERT INTO accounting.meli_posting_periods (org_id, period_start, status, changed_by)
  VALUES (md5('org')::uuid, '2026-01-01', 'OPEN', md5('actor')::uuid);
  PERFORM accounting.create_meli_journal_entry(
    md5('org')::uuid, 'invoice', md5('invoice')::uuid, 'fiscal',
    md5('invoice-key')::uuid, '2026-01-01', 'Factura', md5('actor')::uuid,
    'USD', 1325.75, v_lines);
  PERFORM accounting.create_meli_journal_entry(
    md5('org')::uuid, 'creditNote', md5('note')::uuid, 'fiscal',
    md5('note-key')::uuid, '2026-01-31', 'Nota', md5('actor')::uuid,
    'USD', 1325.75, v_lines);
  v_entry := accounting.create_meli_journal_entry(
    md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
    md5('key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
    'USD', 1325.75, v_lines);
  UPDATE accounting.meli_posting_periods SET status = 'CLOSED'
    WHERE org_id = md5('org')::uuid AND period_start = '2026-01-01';
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'invoice', md5('other-invoice')::uuid, 'fiscal',
      md5('other-invoice-key')::uuid, '2026-01-01', 'Factura', md5('actor')::uuid,
      'USD', 1325.75, v_lines);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%período contable Meli%' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió una factura en período cerrado'; END IF;
  IF accounting.create_meli_journal_entry(
    md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
    md5('key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
    'USD', 1325.75, v_lines) <> v_entry THEN
    RAISE EXCEPTION 'No se pudo recuperar el reintento tras el cierre';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_meli_payment_entry(
      md5('org')::uuid, v_entry, md5('reverse')::uuid,
      '2026-01-03', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%período contable Meli%' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió una reversión en período cerrado'; END IF;

  INSERT INTO accounting.meli_posting_periods (org_id, period_start, status, changed_by)
  VALUES (md5('org')::uuid, '2026-02-01', 'OPEN', md5('actor')::uuid);
  PERFORM accounting.reverse_meli_payment_entry(
    md5('org')::uuid, v_entry, md5('reverse')::uuid,
    '2026-02-01', 'Reversión', md5('actor')::uuid);

  INSERT INTO accounting.journal_entries
    (org_id, tipo_evento, fecha, idempotency_key)
  VALUES (md5('other')::uuid, 'OTRO_EVENTO', '2026-01-01', 'unrelated-entry');
  v_failed := false;
  BEGIN
    INSERT INTO accounting.journal_entries
      (org_id, tipo_evento, fecha, idempotency_key)
    VALUES (md5('other')::uuid, 'MELI_FACTURA', '2026-02-01', 'other-org-entry');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%período contable Meli%' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se usó el período de otra organización'; END IF;
END;
$$;
ROLLBACK;
