-- Run only against an empty disposable database after migrations 001, 002, 006, 024 and 025.
BEGIN;
INSERT INTO accounting.chart_of_accounts
  (id, org_id, codigo, nombre, tipo, naturaleza, moneda)
VALUES
  (md5('debit')::uuid, md5('org')::uuid, '1', 'Debit', 'ACTIVO', 'DEUDORA', 'AMBAS'),
  (md5('credit')::uuid, md5('org')::uuid, '2', 'Credit', 'ACTIVO', 'DEUDORA', 'AMBAS');

DO $$
DECLARE
  v_original uuid;
  v_reversal uuid;
  v_corrected uuid;
  v_failed boolean;
  v_lines jsonb := jsonb_build_array(
    jsonb_build_object('accountId', md5('debit')::uuid, 'side', 'DEBE',
      'originalAmount', '1.00', 'pesosAmount', '1325.75'),
    jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER',
      'originalAmount', '1.00', 'pesosAmount', '1325.75')
  );
BEGIN
  v_original := accounting.create_meli_journal_entry(
    md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
    md5('key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
    'USD', 1325.75, v_lines);
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
      md5('new-key')::uuid, '2026-01-02', 'Cobro corregido', md5('actor')::uuid,
      'USD', 1325.75, v_lines);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se duplicó el componente antes de revertir'; END IF;
  v_reversal := accounting.reverse_meli_payment_entry(
    md5('org')::uuid, v_original, md5('reverse')::uuid, '2026-01-03',
    'Reversión', md5('actor')::uuid);
  IF (SELECT count(*) FROM accounting.journal_entries
    WHERE id IN (v_original, v_reversal) AND moneda = 'USD' AND estado = 'ACTIVO') <> 2
    OR EXISTS (SELECT 1 FROM accounting.journal_entry_lines l
      JOIN accounting.journal_entries e ON e.id = l.journal_entry_id
      WHERE e.id IN (v_original, v_reversal) AND e.estado = 'ACTIVO'
      GROUP BY l.cuenta_id HAVING sum(l.debe - l.haber) <> 0)
    OR (SELECT count(*) FROM accounting.journal_entry_lines
      WHERE journal_entry_id = v_reversal AND monto_origen = 1 AND tipo_cambio = 1325.75) <> 2 THEN
    RAISE EXCEPTION 'La reversión no compensa ni conserva los datos monetarios';
  END IF;
  UPDATE accounting.journal_entries SET estado = 'ANULADO' WHERE id = v_reversal;
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
      md5('new-key')::uuid, '2026-01-04', 'Cobro corregido', md5('actor')::uuid,
      'USD', 1325.75, v_lines);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una reversión inactiva'; END IF;
  UPDATE accounting.journal_entries SET estado = 'ACTIVO' WHERE id = v_reversal;
  UPDATE accounting.journal_entry_lines SET monto_origen = 2
    WHERE journal_entry_id = v_reversal AND cuenta_id = md5('debit')::uuid;
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
      md5('new-key')::uuid, '2026-01-04', 'Cobro corregido', md5('actor')::uuid,
      'USD', 1325.75, v_lines);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una reversión con líneas alteradas'; END IF;
  UPDATE accounting.journal_entry_lines SET monto_origen = 2
    WHERE journal_entry_id = v_original AND cuenta_id = md5('debit')::uuid;
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
      md5('new-key')::uuid, '2026-01-04', 'Cobro corregido', md5('actor')::uuid,
      'USD', 1325.75, v_lines);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un original alterado aunque su reversión coincidiera'; END IF;
  UPDATE accounting.journal_entry_lines SET monto_origen = 1
    WHERE journal_entry_id IN (v_original, v_reversal) AND cuenta_id = md5('debit')::uuid;
  v_corrected := accounting.create_meli_journal_entry(
    md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
    md5('new-key')::uuid, '2026-01-04', 'Cobro corregido', md5('actor')::uuid,
    'USD', 1325.75, v_lines);
  IF v_corrected = v_original OR
    (SELECT count(*) FROM accounting.meli_journal_requests
      WHERE org_id = md5('org')::uuid AND origin_type = 'payment'
        AND origin_id = md5('payment')::uuid AND component_key = 'net') <> 2 THEN
    RAISE EXCEPTION 'No se conservó una versión nueva con la anterior revertida';
  END IF;
  IF accounting.create_meli_journal_entry(
    md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
    md5('key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
    'USD', 1325.75, v_lines) <> v_original THEN
    RAISE EXCEPTION 'El reintento original no conservó su identidad';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
      md5('third-key')::uuid, '2026-01-05', 'Otro cobro', md5('actor')::uuid,
      'USD', 1325.75, v_lines);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se duplicó una versión aún vigente'; END IF;
  PERFORM accounting.create_meli_journal_entry(
    md5('org')::uuid, 'invoice', md5('sale')::uuid, 'fiscal',
    md5('invoice-key')::uuid, '2026-01-02', 'Factura', md5('actor')::uuid,
    'USD', 1325.75, v_lines);
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'invoice', md5('sale')::uuid, 'fiscal',
      md5('other-invoice-key')::uuid, '2026-01-02', 'Factura', md5('actor')::uuid,
      'USD', 1325.75, v_lines);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se duplicó una factura fiscal'; END IF;
END;
$$;
ROLLBACK;
