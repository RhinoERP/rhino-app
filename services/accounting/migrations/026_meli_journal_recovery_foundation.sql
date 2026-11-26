-- Internal lookup only: an absent row does not prove that no request is in flight.
BEGIN;

CREATE FUNCTION accounting.find_meli_journal_request(
  p_org_id uuid,
  p_request_key uuid,
  p_expected_payload jsonb
) RETURNS TABLE (journal_entry_id uuid)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_existing accounting.meli_journal_requests%ROWTYPE;
BEGIN
  IF p_org_id IS NULL OR p_request_key IS NULL
    OR jsonb_typeof(p_expected_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Datos de recuperación Meli inválidos' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('meli-journal-request:' || p_request_key::text, 0)
  );
  SELECT * INTO v_existing FROM accounting.meli_journal_requests
    WHERE request_key = p_request_key;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_existing.org_id IS DISTINCT FROM p_org_id
    OR v_existing.payload IS DISTINCT FROM p_expected_payload THEN
    RAISE EXCEPTION 'La clave ya corresponde a otro asiento Meli' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM accounting.journal_entries e
    WHERE e.id = v_existing.journal_entry_id AND e.org_id = p_org_id
      AND e.tipo_evento = CASE v_existing.origin_type
        WHEN 'invoice' THEN 'MELI_FACTURA'
        WHEN 'creditNote' THEN 'MELI_NOTA_CREDITO'
        ELSE 'MELI_COBRO' END
      AND e.referencia_tabla = CASE v_existing.origin_type
        WHEN 'invoice' THEN 'sales_orders'
        WHEN 'creditNote' THEN 'credit_notes'
        ELSE 'mercadolibre_payments' END
      AND e.referencia_id = v_existing.origin_id
      AND e.estado = 'ACTIVO' AND e.estado_imputacion = 'COMPLETO'
      AND e.fecha = (v_existing.payload->>'date')::date
      AND e.descripcion = v_existing.payload->>'description'
      AND e.creado_por = (v_existing.payload->>'actorId')::uuid
      AND e.moneda = v_existing.payload->>'currency'
      AND e.idempotency_key = 'meli:journal:' || p_request_key::text
  ) THEN
    RAISE EXCEPTION 'El asiento Meli recuperado no coincide con su solicitud';
  END IF;
  IF EXISTS (
    WITH expected AS (
      SELECT (line->>'accountId')::uuid AS cuenta_id,
        CASE WHEN line->>'side' = 'DEBE' THEN (line->>'pesosAmount')::numeric ELSE 0 END AS debe,
        CASE WHEN line->>'side' = 'HABER' THEN (line->>'pesosAmount')::numeric ELSE 0 END AS haber,
        (line->>'originalAmount')::numeric AS monto_origen,
        (v_existing.payload->>'exchangeRate')::numeric AS tipo_cambio,
        NULL::text AS descripcion, false AS pendiente_imputacion
      FROM jsonb_array_elements(v_existing.payload->'lines') AS line
    ), actual AS (
      SELECT l.cuenta_id, l.debe, l.haber, l.monto_origen, l.tipo_cambio, l.descripcion, l.pendiente_imputacion
      FROM accounting.journal_entry_lines l WHERE l.journal_entry_id = v_existing.journal_entry_id
    )
    (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
  ) THEN
    RAISE EXCEPTION 'Las líneas del asiento Meli recuperado no coinciden con su solicitud';
  END IF;
  RETURN QUERY SELECT v_existing.journal_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION accounting.find_meli_journal_request(uuid, uuid, jsonb)
  FROM PUBLIC;
COMMIT;
