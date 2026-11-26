-- Isolated foundation: no application endpoint dispatches these reversals.
BEGIN;

CREATE TABLE accounting.meli_payment_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  original_entry_id uuid NOT NULL UNIQUE REFERENCES accounting.journal_entries(id),
  reversal_entry_id uuid NOT NULL UNIQUE REFERENCES accounting.journal_entries(id),
  request_key uuid NOT NULL UNIQUE,
  reversal_date date NOT NULL,
  description text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accounting.meli_payment_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON accounting.meli_payment_reversals FROM PUBLIC;

CREATE FUNCTION accounting.reverse_meli_payment_entry(
  p_org_id uuid,
  p_original_entry_id uuid,
  p_request_key uuid,
  p_reversal_date date,
  p_description text,
  p_created_by uuid
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_original accounting.journal_entries%ROWTYPE;
  v_existing accounting.meli_payment_reversals%ROWTYPE;
  v_reversal_id uuid;
  v_key text;
BEGIN
  IF p_org_id IS NULL OR p_original_entry_id IS NULL OR p_request_key IS NULL
    OR p_reversal_date IS NULL OR p_created_by IS NULL
    OR p_description IS NULL OR btrim(p_description) = ''
    OR length(p_description) > 2000 THEN
    RAISE EXCEPTION 'Datos de reversión Meli incompletos' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_original FROM accounting.journal_entries
    WHERE id = p_original_entry_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asiento Meli no encontrado para la organización';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('meli-payment-reversal:' || p_request_key::text, 0)
  );
  SELECT * INTO v_existing FROM accounting.meli_payment_reversals
    WHERE request_key = p_request_key;
  IF FOUND THEN
    IF v_existing.org_id IS DISTINCT FROM p_org_id
      OR v_existing.original_entry_id IS DISTINCT FROM p_original_entry_id
      OR v_existing.reversal_date IS DISTINCT FROM p_reversal_date
      OR v_existing.description IS DISTINCT FROM p_description
      OR v_existing.created_by IS DISTINCT FROM p_created_by THEN
      RAISE EXCEPTION 'La clave de reversión ya corresponde a otra solicitud'
        USING ERRCODE = '22023';
    END IF;
    RETURN v_existing.reversal_entry_id;
  END IF;

  IF v_original.tipo_evento IS DISTINCT FROM 'MELI_COBRO'
    OR v_original.referencia_tabla IS DISTINCT FROM 'mercadolibre_payments'
    OR v_original.referencia_id IS NULL OR v_original.estado <> 'ACTIVO'
    OR v_original.anulado_por_id IS NOT NULL
    OR v_original.moneda NOT IN ('ARS', 'USD') OR v_original.moneda IS NULL THEN
    RAISE EXCEPTION 'El asiento no es un cobro Meli activo y verificable';
  END IF;
  IF p_reversal_date < v_original.fecha THEN
    RAISE EXCEPTION 'La reversión no puede ser anterior al asiento original';
  END IF;
  IF EXISTS (SELECT 1 FROM accounting.meli_payment_reversals
    WHERE original_entry_id = p_original_entry_id)
    OR EXISTS (SELECT 1 FROM accounting.journal_entries
      WHERE org_id = p_org_id AND tipo_evento = 'CONTRA_ASIENTO'
        AND referencia_tabla = 'accounting.journal_entries'
        AND referencia_id = p_original_entry_id) THEN
    RAISE EXCEPTION 'El asiento ya tiene una reversión o requiere conciliación';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounting.journal_entry_lines
    WHERE journal_entry_id = p_original_entry_id)
    OR EXISTS (SELECT 1 FROM accounting.journal_entry_lines l
      LEFT JOIN accounting.chart_of_accounts a ON a.id = l.cuenta_id
      WHERE l.journal_entry_id = p_original_entry_id
        AND (a.id IS NULL OR a.org_id <> p_org_id
          OR (l.debe = 0 AND l.haber = 0)
          OR (v_original.moneda = 'USD'
            AND (l.monto_origen IS NULL OR l.monto_origen <= 0
              OR l.tipo_cambio IS NULL OR l.tipo_cambio <= 0
              OR l.monto_origen <> round(l.monto_origen, 2)
              OR round(l.monto_origen * l.tipo_cambio, 2) <> l.debe + l.haber))))
    OR (SELECT sum(debe) <> sum(haber) FROM accounting.journal_entry_lines
      WHERE journal_entry_id = p_original_entry_id)
    OR (v_original.moneda = 'USD' AND
      (SELECT count(DISTINCT tipo_cambio) <> 1
        OR sum(CASE WHEN debe > 0 THEN monto_origen ELSE -monto_origen END) <> 0
        FROM accounting.journal_entry_lines WHERE journal_entry_id = p_original_entry_id)) THEN
    RAISE EXCEPTION 'Las líneas del asiento original no son verificables';
  END IF;

  v_key := 'meli:payment-reversal:' || p_request_key::text;
  INSERT INTO accounting.journal_entries (
    org_id, tipo_evento, referencia_id, referencia_tabla, fecha,
    descripcion, idempotency_key, creado_por, moneda
  ) VALUES (
    p_org_id, 'CONTRA_ASIENTO', p_original_entry_id, 'accounting.journal_entries',
    p_reversal_date, p_description, v_key, p_created_by, v_original.moneda
  ) RETURNING id INTO v_reversal_id;

  INSERT INTO accounting.journal_entry_lines (
    journal_entry_id, cuenta_id, debe, haber, descripcion, monto_origen, tipo_cambio
  )
  SELECT v_reversal_id, cuenta_id, haber, debe, descripcion, monto_origen, tipo_cambio
    FROM accounting.journal_entry_lines WHERE journal_entry_id = p_original_entry_id;

  INSERT INTO accounting.meli_payment_reversals (
    org_id, original_entry_id, reversal_entry_id, request_key,
    reversal_date, description, created_by
  ) VALUES (
    p_org_id, p_original_entry_id, v_reversal_id, p_request_key,
    p_reversal_date, p_description, p_created_by
  );
  RETURN v_reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION accounting.reverse_meli_payment_entry(uuid, uuid, uuid, date, text, uuid)
  FROM PUBLIC;
COMMIT;
