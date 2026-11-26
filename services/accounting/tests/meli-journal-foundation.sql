-- Run only against an empty disposable database after migrations 001, 002, 006 and 024-026.
BEGIN;
INSERT INTO accounting.chart_of_accounts
  (id, org_id, codigo, nombre, tipo, naturaleza, moneda)
VALUES
  (md5('debit')::uuid, md5('org')::uuid, '1', 'Debit', 'ACTIVO', 'DEUDORA', 'AMBAS'),
  (md5('credit')::uuid, md5('org')::uuid, '2', 'Credit', 'ACTIVO', 'DEUDORA', 'AMBAS'),
  (md5('foreign')::uuid, md5('other')::uuid, '3', 'Foreign', 'ACTIVO', 'DEUDORA', 'AMBAS'),
  (md5('ars-only')::uuid, md5('org')::uuid, '4', 'ARS', 'ACTIVO', 'DEUDORA', 'ARS');
INSERT INTO accounting.chart_of_accounts
  (id, org_id, codigo, nombre, tipo, naturaleza, activa, moneda)
VALUES (md5('inactive')::uuid, md5('org')::uuid, '5', 'Inactive', 'ACTIVO', 'DEUDORA', false, 'AMBAS');

DO $$
DECLARE
  v_lines jsonb := jsonb_build_array(
    jsonb_build_object('accountId', md5('debit')::uuid, 'side', 'DEBE',
      'originalAmount', '1.00', 'pesosAmount', '1325.75'),
    jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER',
      'originalAmount', '1.00', 'pesosAmount', '1325.75')
  );
  v_bad jsonb;
  v_payload jsonb;
  v_entry uuid;
  v_replay uuid;
  v_failed boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
    WHERE p.oid = 'accounting.create_meli_journal_entry(uuid,text,uuid,text,uuid,date,text,uuid,text,numeric,jsonb)'::regprocedure
      AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ) THEN RAISE EXCEPTION 'La función no debe ser pública'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
    WHERE p.oid = 'accounting.find_meli_journal_request(uuid,uuid,jsonb)'::regprocedure
      AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ) THEN RAISE EXCEPTION 'La recuperación no debe ser pública'; END IF;

  SELECT accounting.create_meli_journal_entry(
    md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
    md5('key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
    'USD', 1325.75, v_lines) INTO v_entry;
  SELECT accounting.create_meli_journal_entry(
    md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
    md5('key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
    'USD', 1325.75, v_lines) INTO v_replay;
  IF v_entry <> v_replay OR NOT EXISTS (
    SELECT 1 FROM accounting.journal_entries
    WHERE id = v_entry AND moneda = 'USD' AND tipo_evento = 'MELI_COBRO'
      AND referencia_id = md5('payment')::uuid AND referencia_tabla = 'mercadolibre_payments'
  ) OR (SELECT count(*) FROM accounting.journal_entry_lines
    WHERE journal_entry_id = v_entry AND monto_origen = 1 AND tipo_cambio = 1325.75) <> 2 THEN
    RAISE EXCEPTION 'No se persistió o recuperó correctamente el asiento USD';
  END IF;

  SELECT payload INTO v_payload FROM accounting.meli_journal_requests
    WHERE request_key = md5('key')::uuid;
  SELECT journal_entry_id INTO v_replay FROM accounting.find_meli_journal_request(
    md5('org')::uuid, md5('key')::uuid, v_payload);
  IF v_replay IS DISTINCT FROM v_entry THEN
    RAISE EXCEPTION 'La consulta de recuperación no encontró el asiento';
  END IF;
  UPDATE accounting.journal_entries SET estado = 'ANULADO' WHERE id = v_entry;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_journal_request(md5('org')::uuid, md5('key')::uuid, v_payload);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se recuperó un asiento anulado'; END IF;
  UPDATE accounting.journal_entries SET estado = 'ACTIVO' WHERE id = v_entry;
  UPDATE accounting.journal_entry_lines SET monto_origen = 2
    WHERE journal_entry_id = v_entry AND cuenta_id = md5('debit')::uuid;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_journal_request(md5('org')::uuid, md5('key')::uuid, v_payload);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se recuperó un asiento con importes modificados'; END IF;
  UPDATE accounting.journal_entry_lines SET monto_origen = 1
    WHERE journal_entry_id = v_entry AND cuenta_id = md5('debit')::uuid;
  INSERT INTO accounting.journal_entry_lines
    (journal_entry_id, cuenta_id, debe, haber, monto_origen, tipo_cambio)
    SELECT journal_entry_id, cuenta_id, debe, haber, monto_origen, tipo_cambio
    FROM accounting.journal_entry_lines
    WHERE journal_entry_id = v_entry AND cuenta_id = md5('debit')::uuid LIMIT 1;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_journal_request(md5('org')::uuid, md5('key')::uuid, v_payload);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se recuperó un asiento con líneas duplicadas'; END IF;
  DELETE FROM accounting.journal_entry_lines WHERE id = (
    SELECT id FROM accounting.journal_entry_lines WHERE journal_entry_id = v_entry
      AND cuenta_id = md5('debit')::uuid ORDER BY id LIMIT 1);
  SELECT journal_entry_id INTO v_replay FROM accounting.find_meli_journal_request(
    md5('org')::uuid, md5('key')::uuid, v_payload);
  IF v_replay IS DISTINCT FROM v_entry THEN
    RAISE EXCEPTION 'No se recuperó el asiento tras restaurar las líneas';
  END IF;
  IF EXISTS (SELECT 1 FROM accounting.find_meli_journal_request(
    md5('org')::uuid, md5('unknown-key')::uuid, v_payload)) THEN
    RAISE EXCEPTION 'La consulta devolvió un asiento para una clave desconocida';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_journal_request(
      md5('other')::uuid, md5('key')::uuid, v_payload);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se recuperó un asiento de otra organización'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_journal_request(
      md5('org')::uuid, md5('key')::uuid,
      jsonb_set(v_payload, '{description}', '"Distinta"'::jsonb));
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se recuperó un asiento con payload diferente'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.find_meli_journal_request(
      md5('org')::uuid, md5('key')::uuid, NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una recuperación sin payload'; END IF;

  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
      md5('key')::uuid, '2026-01-02', 'Otro', md5('actor')::uuid,
      'USD', 1325.75, v_lines);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó la misma clave con otro payload'; END IF;

  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'net',
      md5('other-key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
      'USD', 1325.75, v_lines);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se duplicó el componente'; END IF;

  v_bad := jsonb_set(v_lines, '{0,accountId}', to_jsonb(md5('foreign')::uuid));
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'foreign',
      md5('foreign-key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
      'USD', 1325.75, v_bad);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó cuenta de otra organización'; END IF;

  v_bad := jsonb_set(v_lines, '{0,accountId}', to_jsonb(md5('ars-only')::uuid));
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'currency',
      md5('currency-key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
      'USD', 1325.75, v_bad);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó cuenta incompatible con USD'; END IF;

  v_bad := jsonb_set(v_lines, '{0,accountId}', to_jsonb(md5('inactive')::uuid));
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'inactive',
      md5('inactive-key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
      'USD', 1325.75, v_bad);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una cuenta inactiva'; END IF;

  v_bad := jsonb_set(v_lines, '{1,originalAmount}', '"2.00"'::jsonb);
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'amount',
      md5('amount-key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
      'USD', 1325.75, v_bad);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó importe incompatible con la tasa'; END IF;

  v_bad := jsonb_set(v_lines, '{1,side}', '"DEBE"'::jsonb);
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'payment', md5('payment')::uuid, 'balance',
      md5('balance-key')::uuid, '2026-01-02', 'Cobro', md5('actor')::uuid,
      'USD', 1325.75, v_bad);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó asiento desbalanceado'; END IF;

  v_bad := jsonb_build_array(
    jsonb_build_object('accountId', md5('debit')::uuid, 'side', 'DEBE',
      'originalAmount', '0.02', 'pesosAmount', '0.03'),
    jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER',
      'originalAmount', '0.01', 'pesosAmount', '0.02'),
    jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER',
      'originalAmount', '0.01', 'pesosAmount', '0.02')
  );
  v_failed := false;
  BEGIN
    PERFORM accounting.create_meli_journal_entry(
      md5('org')::uuid, 'invoice', md5('invoice')::uuid, 'fiscal',
      md5('rounding-key')::uuid, '2026-01-02', 'Factura', md5('actor')::uuid,
      'USD', 1.5, v_bad);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó diferencia de redondeo en pesos'; END IF;

  v_bad := jsonb_build_array(
    jsonb_build_object('accountId', md5('debit')::uuid, 'side', 'DEBE',
      'originalAmount', '100.00', 'pesosAmount', '100.00'),
    jsonb_build_object('accountId', md5('credit')::uuid, 'side', 'HABER',
      'originalAmount', '100.00', 'pesosAmount', '100.00')
  );
  v_replay := accounting.create_meli_journal_entry(
    md5('org')::uuid, 'invoice', md5('invoice')::uuid, 'fiscal',
    md5('invoice-key')::uuid, '2026-01-02', 'Factura', md5('actor')::uuid,
    'ARS', 1, v_bad);
  IF NOT EXISTS (SELECT 1 FROM accounting.journal_entries
    WHERE id = v_replay AND moneda = 'ARS' AND tipo_evento = 'MELI_FACTURA'
      AND referencia_id = md5('invoice')::uuid AND referencia_tabla = 'sales_orders')
    OR (SELECT count(*) FROM accounting.journal_entry_lines
      WHERE journal_entry_id = v_replay AND monto_origen = 100 AND tipo_cambio = 1) <> 2 THEN
    RAISE EXCEPTION 'No se persistió correctamente la factura ARS';
  END IF;

  IF (SELECT count(*) FROM accounting.meli_journal_requests) <> 2
    OR (SELECT count(*) FROM accounting.journal_entries) <> 2 THEN
    RAISE EXCEPTION 'Una solicitud fallida dejó persistencia inesperada';
  END IF;
END;
$$;
ROLLBACK;
