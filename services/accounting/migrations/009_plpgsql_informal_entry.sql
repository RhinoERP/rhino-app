-- ============================================================
-- 009_plpgsql_informal_entry.sql
-- Función transaccional para crear asientos informales
--
-- Prerequisito: 008_informal_entries.sql ejecutado
-- ============================================================

CREATE OR REPLACE FUNCTION accounting.create_informal_entry_transactional(
  p_org_id           UUID,
  p_tipo_evento      TEXT,
  p_referencia_id    UUID,
  p_referencia_tabla TEXT,
  p_fecha            DATE,
  p_descripcion      TEXT,
  p_lineas           JSONB,
  p_idempotency_key  TEXT,
  p_source_type      TEXT,
  p_creado_por       UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id       UUID;
  v_linea          JSONB;
  v_tiene_suspenso BOOLEAN := false;
  v_estado_imput   TEXT    := 'COMPLETO';
BEGIN
  -- 1. Idempotencia: si la clave ya fue procesada, retorna el id existente sin error
  SELECT id INTO v_entry_id
  FROM accounting.informal_entries
  WHERE idempotency_key = p_idempotency_key;

  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  -- 2. Detectar líneas suspenso
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    IF (v_linea->>'pendiente_imputacion')::BOOLEAN IS TRUE
       OR v_linea->>'cuenta_id' IS NULL
       OR v_linea->>'cuenta_id' = ''
    THEN
      v_tiene_suspenso := true;
    END IF;
  END LOOP;

  -- 3. Derivar estado de imputación
  IF v_tiene_suspenso THEN
    v_estado_imput := 'SUSPENSO';
  END IF;

  -- 4. Insertar cabecera del asiento informal
  INSERT INTO accounting.informal_entries (
    org_id,
    tipo_evento,
    referencia_id,
    referencia_tabla,
    fecha,
    descripcion,
    idempotency_key,
    estado_imputacion,
    source_type,
    creado_por
  ) VALUES (
    p_org_id,
    p_tipo_evento,
    p_referencia_id,
    p_referencia_tabla,
    p_fecha,
    p_descripcion,
    p_idempotency_key,
    v_estado_imput,
    p_source_type,
    p_creado_por
  )
  RETURNING id INTO v_entry_id;

  -- 5. Insertar líneas
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    INSERT INTO accounting.informal_entry_lines (
      informal_entry_id,
      cuenta_id,
      debe,
      haber,
      descripcion,
      pendiente_imputacion
    ) VALUES (
      v_entry_id,
      NULLIF(v_linea->>'cuenta_id', '')::UUID,
      COALESCE((v_linea->>'debe')::NUMERIC, 0),
      COALESCE((v_linea->>'haber')::NUMERIC, 0),
      v_linea->>'descripcion',
      COALESCE((v_linea->>'pendiente_imputacion')::BOOLEAN, false)
    );
  END LOOP;

  RETURN v_entry_id;
END;
$$;
