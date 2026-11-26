-- Internal recovery primitive; absence does not prove a request is not in flight.
BEGIN;

CREATE FUNCTION accounting.find_meli_payment_reversal(
  p_org_id uuid,
  p_original_entry_id uuid,
  p_request_key uuid,
  p_reversal_date date,
  p_description text,
  p_created_by uuid
) RETURNS TABLE (reversal_entry_id uuid)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_existing accounting.meli_payment_reversals%ROWTYPE;
BEGIN
  IF p_org_id IS NULL OR p_original_entry_id IS NULL OR p_request_key IS NULL
    OR p_reversal_date IS NULL OR p_created_by IS NULL
    OR p_description IS NULL OR btrim(p_description) = ''
    OR length(p_description) > 2000 THEN
    RAISE EXCEPTION 'Datos de recuperación de reversión Meli incompletos'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('meli-payment-reversal:' || p_request_key::text, 0)
  );
  SELECT * INTO v_existing FROM accounting.meli_payment_reversals
    WHERE request_key = p_request_key;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_existing.org_id IS DISTINCT FROM p_org_id
    OR v_existing.original_entry_id IS DISTINCT FROM p_original_entry_id
    OR v_existing.reversal_date IS DISTINCT FROM p_reversal_date
    OR v_existing.description IS DISTINCT FROM p_description
    OR v_existing.created_by IS DISTINCT FROM p_created_by THEN
    RAISE EXCEPTION 'La clave de reversión ya corresponde a otra solicitud'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM accounting.journal_entries original
    JOIN accounting.journal_entries reversal ON reversal.id = v_existing.reversal_entry_id
    WHERE original.id = p_original_entry_id AND original.org_id = p_org_id
      AND original.tipo_evento = 'MELI_COBRO'
      AND original.referencia_tabla = 'mercadolibre_payments'
      AND original.referencia_id IS NOT NULL AND original.estado = 'ACTIVO'
      AND reversal.org_id = p_org_id AND reversal.estado = 'ACTIVO'
      AND reversal.estado_imputacion = 'COMPLETO'
      AND reversal.tipo_evento = 'CONTRA_ASIENTO'
      AND reversal.referencia_tabla = 'accounting.journal_entries'
      AND reversal.referencia_id = original.id AND reversal.moneda = original.moneda
      AND reversal.fecha = p_reversal_date AND reversal.descripcion = p_description
      AND reversal.creado_por = p_created_by
      AND reversal.idempotency_key = 'meli:payment-reversal:' || p_request_key::text
  ) THEN
    RAISE EXCEPTION 'La reversión Meli recuperada no coincide con su solicitud';
  END IF;
  IF EXISTS (
    WITH expected AS (
      SELECT l.cuenta_id, l.haber AS debe, l.debe AS haber, l.monto_origen,
        l.tipo_cambio, l.descripcion, false AS pendiente_imputacion
      FROM accounting.journal_entry_lines l WHERE l.journal_entry_id = p_original_entry_id
    ), actual AS (
      SELECT l.cuenta_id, l.debe, l.haber, l.monto_origen,
        l.tipo_cambio, l.descripcion, l.pendiente_imputacion
      FROM accounting.journal_entry_lines l WHERE l.journal_entry_id = v_existing.reversal_entry_id
    )
    (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
  ) OR NOT EXISTS (
    SELECT 1 FROM accounting.journal_entry_lines l WHERE l.journal_entry_id = p_original_entry_id
  ) THEN
    RAISE EXCEPTION 'Las líneas de la reversión Meli no compensan el original';
  END IF;
  RETURN QUERY SELECT v_existing.reversal_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION accounting.find_meli_payment_reversal(uuid, uuid, uuid, date, text, uuid)
  FROM PUBLIC;

-- Keep the generic behavior for other origins, but never let it reverse Meli.
CREATE OR REPLACE FUNCTION accounting.create_contra_entry(
  p_original_id uuid,
  p_descripcion text,
  p_idempotency_key text,
  p_creado_por uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_original accounting.journal_entries%ROWTYPE;
  v_lineas jsonb := '[]'::jsonb;
  v_linea accounting.journal_entry_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_original FROM accounting.journal_entries WHERE id = p_original_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asiento original no encontrado: %', p_original_id;
  END IF;
  IF v_original.tipo_evento = 'MELI_COBRO'
    AND v_original.referencia_tabla = 'mercadolibre_payments' THEN
    RAISE EXCEPTION 'La reversión de un cobro Meli requiere el flujo específico';
  END IF;
  IF v_original.estado = 'ANULADO' THEN
    RAISE EXCEPTION 'El asiento % ya está anulado', p_original_id;
  END IF;
  FOR v_linea IN
    SELECT * FROM accounting.journal_entry_lines
    WHERE journal_entry_id = p_original_id ORDER BY id
  LOOP
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id', v_linea.cuenta_id, 'debe', v_linea.haber,
      'haber', v_linea.debe, 'descripcion', v_linea.descripcion,
      'pendiente_imputacion', false
    );
  END LOOP;
  RETURN accounting.create_journal_entry_transactional(
    v_original.org_id, 'CONTRA_ASIENTO', p_original_id,
    'accounting.journal_entries', CURRENT_DATE, p_descripcion, v_lineas,
    p_idempotency_key, p_creado_por
  );
END;
$$;

-- Serialize all contra-entry inserts against the original, including legacy callers.
CREATE FUNCTION accounting.guard_meli_payment_contra_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_original accounting.journal_entries%ROWTYPE;
BEGIN
  IF NEW.tipo_evento IS DISTINCT FROM 'CONTRA_ASIENTO'
    OR NEW.referencia_tabla IS DISTINCT FROM 'accounting.journal_entries'
    OR NEW.referencia_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_original FROM accounting.journal_entries
    WHERE id = NEW.referencia_id;
  IF NOT FOUND OR v_original.tipo_evento IS DISTINCT FROM 'MELI_COBRO'
    OR v_original.referencia_tabla IS DISTINCT FROM 'mercadolibre_payments' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_original FROM accounting.journal_entries
    WHERE id = NEW.referencia_id FOR UPDATE;
  IF NOT FOUND OR v_original.tipo_evento IS DISTINCT FROM 'MELI_COBRO'
    OR v_original.referencia_tabla IS DISTINCT FROM 'mercadolibre_payments' THEN
    RAISE EXCEPTION 'El asiento original Meli cambió; requiere revisión';
  END IF;
  IF NEW.org_id IS DISTINCT FROM v_original.org_id
    OR NEW.idempotency_key !~ '^meli:payment-reversal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'La reversión de un cobro Meli requiere el flujo específico';
  END IF;
  IF EXISTS (SELECT 1 FROM accounting.journal_entries
    WHERE tipo_evento = 'CONTRA_ASIENTO'
      AND referencia_tabla = 'accounting.journal_entries'
      AND referencia_id = NEW.referencia_id) THEN
    RAISE EXCEPTION 'El asiento Meli ya tiene un contra-asiento';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER meli_payment_contra_entry_guard
  BEFORE INSERT ON accounting.journal_entries
  FOR EACH ROW EXECUTE FUNCTION accounting.guard_meli_payment_contra_entry();

REVOKE ALL ON FUNCTION accounting.guard_meli_payment_contra_entry() FROM PUBLIC;
COMMIT;
