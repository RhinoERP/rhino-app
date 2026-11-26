-- Run only against an empty disposable database after migrations 001, 002, 006 and 024.
BEGIN;

INSERT INTO accounting.chart_of_accounts (id, org_id, codigo, nombre, tipo, naturaleza)
VALUES
  (md5('debit')::uuid, md5('org')::uuid, '1', 'Debit', 'ACTIVO', 'DEUDORA'),
  (md5('credit')::uuid, md5('org')::uuid, '2', 'Credit', 'ACTIVO', 'DEUDORA');

INSERT INTO accounting.journal_entries
  (id, org_id, fecha, tipo_evento, referencia_id, referencia_tabla, idempotency_key, moneda)
VALUES
  (md5('ars')::uuid, md5('org')::uuid, '2026-01-01', 'MELI_COBRO',
    md5('payment')::uuid, 'mercadolibre_payments', 'test-ars', 'ARS'),
  (md5('usd')::uuid, md5('org')::uuid, '2026-01-01', 'MELI_COBRO',
    md5('payment')::uuid, 'mercadolibre_payments', 'test-usd', 'USD'),
  (md5('missing-rate')::uuid, md5('org')::uuid, '2026-01-01', 'MELI_COBRO',
    md5('payment')::uuid, 'mercadolibre_payments', 'test-missing-rate', 'USD'),
  (md5('bad-rate')::uuid, md5('org')::uuid, '2026-01-01', 'MELI_COBRO',
    md5('payment')::uuid, 'mercadolibre_payments', 'test-bad-rate', 'USD'),
  (md5('previous')::uuid, md5('org')::uuid, '2026-01-01', 'MELI_COBRO',
    md5('payment')::uuid, 'mercadolibre_payments', 'test-previous', 'ARS'),
  (md5('previous-reversal')::uuid, md5('org')::uuid, '2026-01-02', 'CONTRA_ASIENTO',
    md5('previous')::uuid, 'accounting.journal_entries',
    'meli:payment-reversal:' || md5('previous-key')::uuid::text, 'ARS');

INSERT INTO accounting.journal_entry_lines
  (journal_entry_id, cuenta_id, debe, haber, monto_origen, tipo_cambio)
VALUES
  (md5('ars')::uuid, md5('debit')::uuid, 80, 0, NULL, NULL),
  (md5('ars')::uuid, md5('credit')::uuid, 0, 80, NULL, NULL),
  (md5('usd')::uuid, md5('debit')::uuid, 1325.75, 0, 1, 1325.75),
  (md5('usd')::uuid, md5('credit')::uuid, 0, 1325.75, 1, 1325.75),
  (md5('missing-rate')::uuid, md5('debit')::uuid, 100, 0, NULL, NULL),
  (md5('missing-rate')::uuid, md5('credit')::uuid, 0, 100, NULL, NULL),
  (md5('bad-rate')::uuid, md5('debit')::uuid, 100, 0, 1, 2),
  (md5('bad-rate')::uuid, md5('credit')::uuid, 0, 100, 1, 2),
  (md5('previous')::uuid, md5('debit')::uuid, 10, 0, NULL, NULL),
  (md5('previous')::uuid, md5('credit')::uuid, 0, 10, NULL, NULL);

DO $$
DECLARE
  v_ars uuid;
  v_usd uuid;
  v_replay uuid;
  v_failed boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
    WHERE p.oid = 'accounting.reverse_meli_payment_entry(uuid,uuid,uuid,date,text,uuid)'::regprocedure
      AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ) THEN RAISE EXCEPTION 'La función no debe ser pública'; END IF;

  SELECT accounting.reverse_meli_payment_entry(md5('org')::uuid, md5('ars')::uuid,
    md5('key-ars')::uuid, '2026-01-02', 'Reversión ARS', md5('actor')::uuid) INTO v_ars;
  SELECT accounting.reverse_meli_payment_entry(md5('org')::uuid, md5('ars')::uuid,
    md5('key-ars')::uuid, '2026-01-02', 'Reversión ARS', md5('actor')::uuid) INTO v_replay;
  IF v_replay <> v_ars THEN RAISE EXCEPTION 'El reintento no recuperó la reversión'; END IF;

  SELECT accounting.reverse_meli_payment_entry(md5('org')::uuid, md5('usd')::uuid,
    md5('key-usd')::uuid, '2026-01-02', 'Reversión USD', md5('actor')::uuid) INTO v_usd;
  IF NOT EXISTS (SELECT 1 FROM accounting.journal_entries
    WHERE id = v_usd AND moneda = 'USD' AND estado = 'ACTIVO') OR
    (SELECT count(*) FROM accounting.journal_entry_lines
      WHERE journal_entry_id = v_usd AND monto_origen = 1 AND tipo_cambio = 1325.75) <> 2 THEN
    RAISE EXCEPTION 'La reversión no conservó la moneda y cotización';
  END IF;
  IF EXISTS (
    SELECT 1 FROM accounting.journal_entry_lines original
    LEFT JOIN accounting.journal_entry_lines inverse
      ON inverse.journal_entry_id = CASE original.journal_entry_id
        WHEN md5('ars')::uuid THEN v_ars ELSE v_usd END
      AND inverse.cuenta_id = original.cuenta_id
      AND inverse.debe = original.haber AND inverse.haber = original.debe
      AND inverse.monto_origen IS NOT DISTINCT FROM original.monto_origen
      AND inverse.tipo_cambio IS NOT DISTINCT FROM original.tipo_cambio
    WHERE original.journal_entry_id IN (md5('ars')::uuid, md5('usd')::uuid)
      AND inverse.id IS NULL
  ) THEN RAISE EXCEPTION 'La reversión no invirtió las líneas originales'; END IF;
  IF (SELECT count(*) FROM accounting.journal_entries
    WHERE id IN (md5('ars')::uuid, md5('usd')::uuid, v_ars, v_usd) AND estado = 'ACTIVO') <> 4 OR
    EXISTS (SELECT 1 FROM accounting.journal_entry_lines l
      JOIN accounting.journal_entries e ON e.id = l.journal_entry_id
      WHERE e.id IN (md5('ars')::uuid, md5('usd')::uuid, v_ars, v_usd)
        AND e.estado = 'ACTIVO'
      GROUP BY l.cuenta_id HAVING sum(l.debe - l.haber) <> 0) THEN
    RAISE EXCEPTION 'Los movimientos activos no compensan en libros';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_meli_payment_entry(md5('org')::uuid, md5('ars')::uuid,
      md5('key-ars')::uuid, '2026-01-03', 'Reversión ARS', md5('actor')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un reintento con datos distintos'; END IF;

  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_meli_payment_entry(md5('org')::uuid, md5('ars')::uuid,
      md5('another-key')::uuid, '2026-01-02', 'Otra reversión', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una segunda reversión'; END IF;

  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_meli_payment_entry(md5('other-org')::uuid, md5('usd')::uuid,
      md5('other-key')::uuid, '2026-01-02', 'Otra organización', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una organización incorrecta'; END IF;

  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_meli_payment_entry(md5('org')::uuid, md5('missing-rate')::uuid,
      md5('key-ars')::uuid, '2026-01-02', 'Reversión ARS', md5('actor')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se reutilizó una clave para otro asiento'; END IF;

  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_meli_payment_entry(md5('org')::uuid, md5('missing-rate')::uuid,
      md5('key-missing')::uuid, '2026-01-02', 'Sin cotización', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una reversión USD sin cotización'; END IF;

  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_meli_payment_entry(md5('org')::uuid, md5('bad-rate')::uuid,
      md5('key-bad-rate')::uuid, '2026-01-02', 'Cotización inconsistente', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una cotización USD inconsistente'; END IF;

  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_meli_payment_entry(md5('org')::uuid, md5('previous')::uuid,
      md5('key-previous')::uuid, '2026-01-02', 'Reversión existente', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un contra-asiento preexistente'; END IF;

  v_failed := false;
  BEGIN
    PERFORM accounting.reverse_meli_payment_entry(md5('org')::uuid, md5('missing-rate')::uuid,
      md5('key-before')::uuid, '2025-12-31', 'Fecha anterior', md5('actor')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una fecha anterior al original'; END IF;

  IF (SELECT count(*) FROM accounting.meli_payment_reversals) <> 2 THEN
    RAISE EXCEPTION 'Una reversión fallida dejó persistencia inesperada';
  END IF;
END;
$$;
ROLLBACK;
