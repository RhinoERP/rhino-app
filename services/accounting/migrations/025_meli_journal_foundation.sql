-- Isolated accounting primitive. It is not an application-facing publisher.
-- The future orchestrator must validate source identity, periods, authorization,
-- antecedents, reconciliation and all other business rules before invoking it.
BEGIN;

CREATE TABLE accounting.meli_journal_requests (
  request_key uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  origin_type text NOT NULL CHECK (origin_type IN ('invoice', 'creditNote', 'payment')),
  origin_id uuid NOT NULL,
  component_key text NOT NULL,
  payload jsonb NOT NULL,
  journal_entry_id uuid NOT NULL UNIQUE REFERENCES accounting.journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meli_journal_requests_origin
  ON accounting.meli_journal_requests (org_id, origin_type, origin_id, component_key);

ALTER TABLE accounting.meli_journal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON accounting.meli_journal_requests FROM PUBLIC;

CREATE FUNCTION accounting.create_meli_journal_entry(
  p_org_id uuid,
  p_origin_type text,
  p_origin_id uuid,
  p_component_key text,
  p_request_key uuid,
  p_date date,
  p_description text,
  p_actor_id uuid,
  p_currency text,
  p_exchange_rate numeric,
  p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_existing accounting.meli_journal_requests%ROWTYPE;
  v_payload jsonb;
  v_line jsonb;
  v_account uuid;
  v_side text;
  v_original numeric;
  v_pesos numeric;
  v_original_balance numeric := 0;
  v_pesos_balance numeric := 0;
  v_entry uuid;
  v_event text;
  v_reference_table text;
BEGIN
  IF p_org_id IS NULL OR p_origin_id IS NULL OR p_request_key IS NULL
    OR p_date IS NULL OR p_actor_id IS NULL OR p_description IS NULL
    OR length(btrim(p_description)) NOT BETWEEN 1 AND 2000
    OR p_origin_type IS NULL OR p_origin_type NOT IN ('invoice', 'creditNote', 'payment')
    OR p_component_key IS NULL OR length(p_component_key) NOT BETWEEN 1 AND 200
    OR (p_origin_type <> 'payment' AND p_component_key <> 'fiscal')
    OR p_currency IS NULL OR p_currency NOT IN ('ARS', 'USD')
    OR p_exchange_rate IS NULL OR p_exchange_rate <= 0
    OR p_exchange_rate >= 1000000 OR p_exchange_rate <> round(p_exchange_rate, 4)
    OR (p_currency = 'ARS' AND p_exchange_rate <> 1)
    OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Datos del asiento Meli inválidos' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_lines) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'Cantidad de líneas inválida' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'orgId', p_org_id, 'originType', p_origin_type, 'originId', p_origin_id,
    'componentKey', p_component_key, 'date', p_date, 'description', p_description,
    'actorId', p_actor_id, 'currency', p_currency, 'exchangeRate', p_exchange_rate,
    'lines', p_lines
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('meli-journal-request:' || p_request_key::text, 0)
  );
  SELECT * INTO v_existing FROM accounting.meli_journal_requests
    WHERE request_key = p_request_key;
  IF FOUND THEN
    IF v_existing.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'La clave ya corresponde a otro asiento Meli' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing.journal_entry_id;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'meli-journal-origin:' || p_org_id::text || ':' || p_origin_type || ':' ||
      p_origin_id::text || ':' || p_component_key, 0
  ));
  IF EXISTS (SELECT 1 FROM accounting.meli_journal_requests
    WHERE org_id = p_org_id AND origin_type = p_origin_type
      AND origin_id = p_origin_id AND component_key = p_component_key
      AND (p_origin_type <> 'payment' OR NOT EXISTS (
        SELECT 1 FROM accounting.meli_payment_reversals r
        JOIN accounting.journal_entries original ON original.id = r.original_entry_id
        JOIN accounting.journal_entries reversal ON reversal.id = r.reversal_entry_id
        WHERE r.org_id = p_org_id
          AND r.original_entry_id = meli_journal_requests.journal_entry_id
          AND original.org_id = p_org_id AND original.estado = 'ACTIVO'
          AND original.tipo_evento = 'MELI_COBRO'
          AND original.referencia_tabla = 'mercadolibre_payments'
          AND original.referencia_id = p_origin_id
          AND original.estado_imputacion = 'COMPLETO'
          AND original.fecha = (meli_journal_requests.payload->>'date')::date
          AND original.descripcion = meli_journal_requests.payload->>'description'
          AND original.creado_por = (meli_journal_requests.payload->>'actorId')::uuid
          AND original.moneda = meli_journal_requests.payload->>'currency'
          AND original.idempotency_key = 'meli:journal:' || meli_journal_requests.request_key::text
          AND reversal.org_id = p_org_id AND reversal.estado = 'ACTIVO'
          AND reversal.estado_imputacion = 'COMPLETO'
          AND reversal.tipo_evento = 'CONTRA_ASIENTO'
          AND reversal.referencia_tabla = 'accounting.journal_entries'
          AND reversal.referencia_id = original.id
          AND reversal.moneda = original.moneda
          AND reversal.fecha = r.reversal_date AND reversal.descripcion = r.description
          AND reversal.creado_por = r.created_by
          AND reversal.idempotency_key = 'meli:payment-reversal:' || r.request_key::text
          AND NOT EXISTS (
            WITH expected AS (
              SELECT (line->>'accountId')::uuid AS cuenta_id,
                CASE WHEN line->>'side' = 'DEBE' THEN (line->>'pesosAmount')::numeric ELSE 0 END AS debe,
                CASE WHEN line->>'side' = 'HABER' THEN (line->>'pesosAmount')::numeric ELSE 0 END AS haber,
                (line->>'originalAmount')::numeric AS monto_origen,
                (meli_journal_requests.payload->>'exchangeRate')::numeric AS tipo_cambio
              FROM jsonb_array_elements(meli_journal_requests.payload->'lines') AS line
            ), actual AS (
              SELECT l.cuenta_id, l.debe, l.haber, l.monto_origen, l.tipo_cambio
              FROM accounting.journal_entry_lines l
              WHERE l.journal_entry_id = original.id
                AND l.descripcion IS NULL AND NOT l.pendiente_imputacion
            )
            (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
            UNION ALL
            (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
          )
          AND NOT EXISTS (
            SELECT 1 FROM accounting.journal_entry_lines l
            WHERE l.journal_entry_id = original.id
              AND (l.descripcion IS NOT NULL OR l.pendiente_imputacion)
          )
          AND NOT EXISTS (
            WITH expected AS (
              SELECT l.cuenta_id, l.haber AS debe, l.debe AS haber, l.monto_origen,
                l.tipo_cambio, l.descripcion, false AS pendiente_imputacion
              FROM accounting.journal_entry_lines l WHERE l.journal_entry_id = original.id
            ), actual AS (
              SELECT l.cuenta_id, l.debe, l.haber, l.monto_origen, l.tipo_cambio,
                l.descripcion, l.pendiente_imputacion
              FROM accounting.journal_entry_lines l WHERE l.journal_entry_id = reversal.id
            )
            (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
            UNION ALL
            (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
          )
      ))) THEN
    RAISE EXCEPTION 'El componente ya tiene un asiento Meli';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
      OR v_line - ARRAY['accountId', 'side', 'originalAmount', 'pesosAmount'] <> '{}'::jsonb
      OR jsonb_typeof(v_line->'accountId') IS DISTINCT FROM 'string'
      OR (v_line->>'accountId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(v_line->'side') IS DISTINCT FROM 'string'
      OR (v_line->>'side') NOT IN ('DEBE', 'HABER')
      OR jsonb_typeof(v_line->'originalAmount') IS DISTINCT FROM 'string'
      OR (v_line->>'originalAmount') !~ '^(0|[1-9][0-9]{0,10})(\.[0-9]{1,2})?$'
      OR jsonb_typeof(v_line->'pesosAmount') IS DISTINCT FROM 'string'
      OR (v_line->>'pesosAmount') !~ '^(0|[1-9][0-9]{0,10})(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Línea de asiento Meli inválida' USING ERRCODE = '22023';
    END IF;
    v_account := (v_line->>'accountId')::uuid;
    v_side := v_line->>'side';
    v_original := (v_line->>'originalAmount')::numeric;
    v_pesos := (v_line->>'pesosAmount')::numeric;
    IF v_original <= 0 OR v_pesos <= 0
      OR round(v_original * p_exchange_rate, 2) <> v_pesos THEN
      RAISE EXCEPTION 'Importes o cotización de línea inconsistentes' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM accounting.chart_of_accounts
      WHERE id = v_account AND org_id = p_org_id AND activa AND permite_movimientos
        AND moneda IN (p_currency, 'AMBAS') FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta no disponible para la organización o moneda';
    END IF;
    v_original_balance := v_original_balance +
      CASE WHEN v_side = 'DEBE' THEN v_original ELSE -v_original END;
    v_pesos_balance := v_pesos_balance +
      CASE WHEN v_side = 'DEBE' THEN v_pesos ELSE -v_pesos END;
  END LOOP;
  IF v_original_balance <> 0 OR v_pesos_balance <> 0 THEN
    RAISE EXCEPTION 'El asiento Meli no cuadra en moneda de origen o pesos';
  END IF;

  v_event := CASE p_origin_type WHEN 'invoice' THEN 'MELI_FACTURA'
    WHEN 'creditNote' THEN 'MELI_NOTA_CREDITO' ELSE 'MELI_COBRO' END;
  v_reference_table := CASE p_origin_type WHEN 'invoice' THEN 'sales_orders'
    WHEN 'creditNote' THEN 'credit_notes' ELSE 'mercadolibre_payments' END;
  INSERT INTO accounting.journal_entries (
    org_id, tipo_evento, referencia_id, referencia_tabla, fecha, descripcion,
    idempotency_key, creado_por, moneda
  ) VALUES (
    p_org_id, v_event, p_origin_id, v_reference_table, p_date, p_description,
    'meli:journal:' || p_request_key::text, p_actor_id, p_currency
  ) RETURNING id INTO v_entry;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO accounting.journal_entry_lines (
      journal_entry_id, cuenta_id, debe, haber, monto_origen, tipo_cambio
    ) VALUES (
      v_entry, (v_line->>'accountId')::uuid,
      CASE WHEN v_line->>'side' = 'DEBE' THEN (v_line->>'pesosAmount')::numeric ELSE 0 END,
      CASE WHEN v_line->>'side' = 'HABER' THEN (v_line->>'pesosAmount')::numeric ELSE 0 END,
      (v_line->>'originalAmount')::numeric, p_exchange_rate
    );
  END LOOP;
  INSERT INTO accounting.meli_journal_requests (
    request_key, org_id, origin_type, origin_id, component_key, payload, journal_entry_id
  ) VALUES (
    p_request_key, p_org_id, p_origin_type, p_origin_id, p_component_key, v_payload, v_entry
  );
  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION accounting.create_meli_journal_entry(
  uuid, text, uuid, text, uuid, date, text, uuid, text, numeric, jsonb
) FROM PUBLIC;
COMMIT;
