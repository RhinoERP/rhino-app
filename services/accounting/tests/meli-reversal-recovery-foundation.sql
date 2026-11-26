-- Run only against an empty disposable database after migrations 001-004, 006, 024 and 027.
BEGIN;
INSERT INTO accounting.chart_of_accounts
  (id, org_id, codigo, nombre, tipo, naturaleza)
VALUES
  (md5('debit')::uuid, md5('org')::uuid, '1', 'Debit', 'ACTIVO', 'DEUDORA'),
  (md5('credit')::uuid, md5('org')::uuid, '2', 'Credit', 'ACTIVO', 'DEUDORA');
INSERT INTO accounting.journal_entries
  (id, org_id, fecha, tipo_evento, referencia_id, referencia_tabla, idempotency_key, moneda)
VALUES
  (md5('original')::uuid, md5('org')::uuid, '2026-01-01', 'MELI_COBRO',
    md5('payment')::uuid, 'mercadolibre_payments', 'test-original', 'USD'),
  (md5('other-original')::uuid, md5('org')::uuid, '2026-01-01', 'COBRO',
    md5('other-payment')::uuid, 'receivable_payments', 'test-other-original', 'ARS');
INSERT INTO accounting.journal_entry_lines
  (journal_entry_id, cuenta_id, debe, haber, monto_origen, tipo_cambio)
VALUES
  (md5('original')::uuid, md5('debit')::uuid, 1325.75, 0, 1, 1325.75),
  (md5('original')::uuid, md5('credit')::uuid, 0, 1325.75, 1, 1325.75),
  (md5('other-original')::uuid, md5('debit')::uuid, 12, 0, NULL, NULL),
  (md5('other-original')::uuid, md5('credit')::uuid, 0, 12, NULL, NULL);

DO $$
DECLARE
  v_reversal uuid;
  v_found uuid;
  v_failed boolean;
BEGIN
  v_found := accounting.create_contra_entry(md5('other-original')::uuid,
    'Reversión no Meli', 'legacy-other-channel', md5('actor')::uuid);
  IF NOT EXISTS (SELECT 1 FROM accounting.journal_entry_lines
      WHERE journal_entry_id = v_found AND cuenta_id = md5('debit')::uuid
        AND debe = 0 AND haber = 12)
    OR NOT EXISTS (SELECT 1 FROM accounting.journal_entry_lines
      WHERE journal_entry_id = v_found AND cuenta_id = md5('credit')::uuid
        AND debe = 12 AND haber = 0) THEN
    RAISE EXCEPTION 'La reversión genérica de otro canal no conservó su comportamiento';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
    WHERE p.oid = 'accounting.find_meli_payment_reversal(uuid,uuid,uuid,date,text,uuid)'::regprocedure
      AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ) THEN RAISE EXCEPTION 'La recuperación no debe ser pública'; END IF;
  IF EXISTS (
    SELECT 1 FROM accounting.find_meli_payment_reversal(
      md5('org')::uuid, md5('original')::uuid, md5('key')::uuid,
      '2026-01-02', 'Reversión', md5('actor')::uuid)
  ) THEN RAISE EXCEPTION 'Una reversión desconocida no debe aparecer'; END IF;
  v_failed := false;
  BEGIN
    INSERT INTO accounting.journal_entries
      (org_id, fecha, tipo_evento, referencia_id, referencia_tabla, idempotency_key)
    VALUES (md5('org')::uuid, '2026-01-02', 'CONTRA_ASIENTO', md5('original')::uuid,
      'accounting.journal_entries', 'legacy-key');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una reversión genérica de Meli'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.create_contra_entry(
      md5('original')::uuid, 'Reversión genérica', 'legacy-function', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'La función genérica revirtió un cobro Meli'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.create_contra_entry(
      md5('original')::uuid, 'Reversión genérica',
      'meli:payment-reversal:' || md5('spoof')::uuid::text, md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'La función genérica aceptó una clave Meli'; END IF;
  v_failed := false;
  BEGIN
    INSERT INTO accounting.journal_entries
      (org_id, fecha, tipo_evento, referencia_id, referencia_tabla, idempotency_key)
    VALUES (md5('other')::uuid, '2026-01-02', 'CONTRA_ASIENTO', md5('original')::uuid,
      'accounting.journal_entries', 'meli:payment-reversal:' || md5('key')::uuid::text);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un contra-asiento de otra organización'; END IF;
  v_reversal := accounting.reverse_meli_payment_entry(
    md5('org')::uuid, md5('original')::uuid, md5('key')::uuid,
    '2026-01-02', 'Reversión', md5('actor')::uuid);
  SELECT reversal_entry_id INTO v_found FROM accounting.find_meli_payment_reversal(
    md5('org')::uuid, md5('original')::uuid, md5('key')::uuid,
    '2026-01-02', 'Reversión', md5('actor')::uuid);
  IF v_found IS DISTINCT FROM v_reversal THEN
    RAISE EXCEPTION 'No se recuperó la reversión confirmada';
  END IF;
  UPDATE accounting.journal_entry_lines SET monto_origen = 2
    WHERE journal_entry_id = v_reversal AND cuenta_id = md5('debit')::uuid;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_payment_reversal(
      md5('org')::uuid, md5('original')::uuid, md5('key')::uuid,
      '2026-01-02', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se recuperó una reversión con importe alterado'; END IF;
  UPDATE accounting.journal_entry_lines SET monto_origen = 1
    WHERE journal_entry_id = v_reversal AND cuenta_id = md5('debit')::uuid;
  UPDATE accounting.journal_entries SET estado = 'ANULADO' WHERE id = v_reversal;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_payment_reversal(
      md5('org')::uuid, md5('original')::uuid, md5('key')::uuid,
      '2026-01-02', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se recuperó una reversión inactiva'; END IF;
  UPDATE accounting.journal_entries SET estado = 'ACTIVO' WHERE id = v_reversal;
  v_failed := false;
  BEGIN
    INSERT INTO accounting.journal_entries
      (org_id, fecha, tipo_evento, referencia_id, referencia_tabla, idempotency_key)
    VALUES (md5('org')::uuid, '2026-01-02', 'CONTRA_ASIENTO', md5('original')::uuid,
      'accounting.journal_entries', 'meli:payment-reversal:' || md5('another-key')::uuid::text);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un segundo contra-asiento'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_payment_reversal(
      md5('other')::uuid, md5('original')::uuid, md5('key')::uuid,
      '2026-01-02', 'Reversión', md5('actor')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó otra organización'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_payment_reversal(
      md5('org')::uuid, md5('original')::uuid, md5('key')::uuid,
      '2026-01-02', 'Otra descripción', md5('actor')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó otro payload'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_payment_reversal(
      md5('org')::uuid, md5('original')::uuid, md5('key')::uuid,
      '2026-01-02', 'Reversión', NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un actor nulo'; END IF;
END;
$$;
ROLLBACK;
