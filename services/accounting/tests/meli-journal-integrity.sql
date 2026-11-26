-- Run only in a disposable database after migrations 001, 002, 006 and 024-031.
BEGIN;

CREATE FUNCTION pg_temp.must_fail(p_sql text, p_message text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN raise_exception THEN
    v_error := SQLERRM;
  END;
  IF v_error IS NULL OR position(p_message IN v_error) = 0 THEN
    RAISE EXCEPTION 'No se rechazó la operación esperada: %, error: %', p_sql, v_error;
  END IF;
END;
$$;

INSERT INTO accounting.chart_of_accounts
  (id, org_id, codigo, nombre, tipo, naturaleza, moneda)
VALUES
  (md5('integrity-debit')::uuid, md5('integrity-org')::uuid, 'I1', 'Debit', 'ACTIVO', 'DEUDORA', 'AMBAS'),
  (md5('integrity-credit')::uuid, md5('integrity-org')::uuid, 'I2', 'Credit', 'ACTIVO', 'DEUDORA', 'AMBAS');
INSERT INTO accounting.meli_posting_periods (org_id, period_start, status, changed_by)
VALUES (md5('integrity-org')::uuid, '2026-07-01', 'OPEN', md5('integrity-actor')::uuid);

SELECT accounting.create_meli_journal_entry(
  md5('integrity-org')::uuid, kind, md5(kind)::uuid, component, md5(kind || '-request')::uuid,
  '2026-07-01', 'Meli', md5('integrity-actor')::uuid, 'USD', 2,
  jsonb_build_array(
    jsonb_build_object('accountId', md5('integrity-debit')::uuid, 'side', 'DEBE', 'originalAmount', '1', 'pesosAmount', '2'),
    jsonb_build_object('accountId', md5('integrity-credit')::uuid, 'side', 'HABER', 'originalAmount', '1', 'pesosAmount', '2')
  )
) FROM (VALUES ('invoice', 'fiscal'), ('creditNote', 'fiscal'), ('payment', 'net')) AS input(kind, component);

SELECT accounting.reverse_verified_meli_payment(
  md5('integrity-org')::uuid, journal_entry_id, request_key, payload,
  md5('integrity-reversal')::uuid, '2026-07-02', 'Reversión', md5('integrity-actor')::uuid
) FROM accounting.meli_journal_requests WHERE origin_type = 'payment' AND origin_id = md5('payment')::uuid;

SELECT pg_temp.must_fail(
  $$UPDATE accounting.journal_entries SET descripcion = 'alterado'
    WHERE id = (SELECT journal_entry_id FROM accounting.meli_journal_requests WHERE origin_id = md5('invoice')::uuid)$$,
  'no puede modificarse'
);
SELECT pg_temp.must_fail(
  $$DELETE FROM accounting.journal_entries
    WHERE id = (SELECT reversal_entry_id FROM accounting.meli_payment_reversals WHERE request_key = md5('integrity-reversal')::uuid)$$,
  'no puede modificarse'
);
SELECT pg_temp.must_fail(
  $$UPDATE accounting.journal_entry_lines SET debe = debe + 1
    WHERE journal_entry_id = (SELECT journal_entry_id FROM accounting.meli_journal_requests WHERE origin_id = md5('payment')::uuid)$$,
  'son inmutables'
);
SELECT pg_temp.must_fail(
  $$DELETE FROM accounting.journal_entry_lines
    WHERE journal_entry_id = (SELECT reversal_entry_id FROM accounting.meli_payment_reversals WHERE request_key = md5('integrity-reversal')::uuid)$$,
  'son inmutables'
);
SELECT pg_temp.must_fail(
  $$INSERT INTO accounting.journal_entry_lines (journal_entry_id, cuenta_id, debe)
    SELECT journal_entry_id, md5('integrity-debit')::uuid, 1 FROM accounting.meli_journal_requests
      WHERE origin_id = md5('invoice')::uuid$$,
  'son inmutables'
);
SELECT pg_temp.must_fail(
  $$UPDATE accounting.meli_journal_requests SET payload = '{}'::jsonb
    WHERE origin_id = md5('payment')::uuid$$,
  'recibo contable Meli vinculado es inmutable'
);
SELECT pg_temp.must_fail(
  $$DELETE FROM accounting.meli_payment_reversals WHERE request_key = md5('integrity-reversal')::uuid$$,
  'recibo contable Meli vinculado es inmutable'
);
SELECT pg_temp.must_fail(
  $$INSERT INTO accounting.journal_entries (org_id, tipo_evento, referencia_tabla, referencia_id, fecha, idempotency_key)
    SELECT org_id, 'CONTRA_ASIENTO', 'accounting.journal_entries', journal_entry_id, '2026-07-01', 'illegal:' || origin_type
      FROM accounting.meli_journal_requests WHERE origin_id = md5('invoice')::uuid$$,
  'no admite reversión genérica'
);
SELECT pg_temp.must_fail(
  $$INSERT INTO accounting.journal_entries (org_id, tipo_evento, referencia_tabla, referencia_id, fecha, idempotency_key)
    SELECT org_id, 'CONTRA_ASIENTO', 'accounting.journal_entries', reversal_entry_id, '2026-07-02', 'illegal:double'
      FROM accounting.meli_payment_reversals WHERE request_key = md5('integrity-reversal')::uuid$$,
  'no admite reversión genérica'
);

-- Ordinary journal entries still allow line and header updates.
INSERT INTO accounting.journal_entries (id, org_id, tipo_evento, fecha, idempotency_key)
VALUES (md5('unrelated-entry')::uuid, md5('integrity-org')::uuid, 'OTHER', '2026-07-01', 'integrity:other');
INSERT INTO accounting.journal_entry_lines (journal_entry_id, cuenta_id, debe)
VALUES (md5('unrelated-entry')::uuid, md5('integrity-debit')::uuid, 1);
UPDATE accounting.journal_entries SET descripcion = 'actualizado' WHERE id = md5('unrelated-entry')::uuid;
UPDATE accounting.journal_entry_lines SET debe = 2 WHERE journal_entry_id = md5('unrelated-entry')::uuid;
INSERT INTO accounting.journal_entries (org_id, tipo_evento, referencia_tabla, referencia_id, fecha, idempotency_key)
VALUES (md5('integrity-org')::uuid, 'CONTRA_ASIENTO', 'accounting.journal_entries',
  md5('unrelated-entry')::uuid, '2026-07-01', 'integrity:ordinary-contra');
SELECT pg_temp.must_fail(
  $$INSERT INTO accounting.journal_entries (org_id, tipo_evento, referencia_tabla, referencia_id, fecha, idempotency_key)
    VALUES (md5('integrity-org')::uuid, 'CONTRA_ASIENTO', 'accounting.journal_entries',
      md5('missing-entry')::uuid, '2026-07-01', 'integrity:missing-original')$$,
  'no existe o no es visible'
);

SELECT pg_temp.must_fail(
  $$UPDATE accounting.journal_entry_lines SET journal_entry_id =
      (SELECT journal_entry_id FROM accounting.meli_journal_requests WHERE origin_id = md5('invoice')::uuid)
    WHERE journal_entry_id = md5('unrelated-entry')::uuid$$,
  'son inmutables'
);

ROLLBACK;
