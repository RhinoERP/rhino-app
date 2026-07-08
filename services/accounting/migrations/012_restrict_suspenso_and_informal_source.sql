-- ============================================================
-- 012_restrict_suspenso_and_informal_source.sql
--
-- Objetivo:
--   Eliminar `estado_imputacion` de journal_entries e informal_entries
--   y `pendiente_imputacion` de sus tablas de líneas.
--   Estos campos eran artefactos del estado SUSPENSO, que ya no existe:
--   los asientos formales existen o no existen (sin estado intermedio),
--   y los informales tienen `estado_formalizacion` como máquina de
--   estado propia.
--   Se agrega NOT NULL en cuenta_id para garantizar que ninguna línea
--   quede sin cuenta asignada.
--
-- Prerrequisito — cancelar informales SUSPENSO antes de migrar:
--
--   UPDATE accounting.informal_entries
--   SET estado_formalizacion = 'CANCELADO'
--   WHERE estado_imputacion = 'SUSPENSO'
--     AND estado_formalizacion = 'PENDIENTE';
-- ============================================================

SET search_path TO accounting, public;

-- ============================================================
-- A. ASIENTOS FORMALES
-- ============================================================

-- A1. Eliminar estado_imputacion de journal_entries
ALTER TABLE accounting.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_estado_imputacion_check;

ALTER TABLE accounting.journal_entries
  DROP COLUMN IF EXISTS estado_imputacion;

-- A2. Eliminar pendiente_imputacion de journal_entry_lines
--     y agregar NOT NULL en cuenta_id
ALTER TABLE accounting.journal_entry_lines
  DROP CONSTRAINT IF EXISTS journal_entry_lines_no_pendiente,
  DROP CONSTRAINT IF EXISTS journal_entry_lines_cuenta_requerida;

ALTER TABLE accounting.journal_entry_lines
  DROP COLUMN IF EXISTS pendiente_imputacion;

ALTER TABLE accounting.journal_entry_lines
  ALTER COLUMN cuenta_id SET NOT NULL;

-- ============================================================
-- B. ASIENTOS INFORMALES
-- ============================================================

-- B1. source_type — sin restricción en BD por ahora

-- B2. Eliminar estado_imputacion de informal_entries
ALTER TABLE accounting.informal_entries
  DROP CONSTRAINT IF EXISTS informal_entries_estado_imputacion_check;

ALTER TABLE accounting.informal_entries
  DROP COLUMN IF EXISTS estado_imputacion;

-- B3. Eliminar pendiente_imputacion de informal_entry_lines
--     y agregar NOT NULL en cuenta_id
ALTER TABLE accounting.informal_entry_lines
  DROP CONSTRAINT IF EXISTS informal_entry_lines_no_pendiente,
  DROP CONSTRAINT IF EXISTS informal_entry_lines_cuenta_requerida;

ALTER TABLE accounting.informal_entry_lines
  DROP COLUMN IF EXISTS pendiente_imputacion;

ALTER TABLE accounting.informal_entry_lines
  ALTER COLUMN cuenta_id SET NOT NULL;

-- ============================================================
-- C. FUNCIONES PL/pgSQL — reescribir sin estado_imputacion
--    ni pendiente_imputacion
-- ============================================================

-- C1. create_journal_entry_transactional
CREATE OR REPLACE FUNCTION accounting.create_journal_entry_transactional(
  p_org_id           UUID,
  p_tipo_evento      TEXT,
  p_referencia_id    UUID,
  p_referencia_tabla TEXT,
  p_fecha            DATE,
  p_descripcion      TEXT,
  p_lineas           JSONB,
  p_idempotency_key  TEXT,
  p_creado_por       UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id   UUID;
  v_linea      JSONB;
  v_suma_debe  NUMERIC(15,4) := 0;
  v_suma_haber NUMERIC(15,4) := 0;
BEGIN
  -- 1. Idempotencia
  SELECT id INTO v_entry_id
  FROM accounting.journal_entries
  WHERE idempotency_key = p_idempotency_key;

  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  -- 2. Validar líneas y acumular balance
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    IF v_linea->>'cuenta_id' IS NULL OR v_linea->>'cuenta_id' = '' THEN
      RAISE EXCEPTION 'Asiento rechazado: línea sin cuenta asignada.';
    END IF;

    v_suma_debe  := v_suma_debe  + COALESCE((v_linea->>'debe') ::NUMERIC, 0);
    v_suma_haber := v_suma_haber + COALESCE((v_linea->>'haber')::NUMERIC, 0);
  END LOOP;

  -- 3. Verificar balance
  IF ABS(v_suma_debe - v_suma_haber) > 0.001 THEN
    RAISE EXCEPTION 'Asiento desbalanceado: debe=% haber=% diferencia=%',
      v_suma_debe, v_suma_haber, ABS(v_suma_debe - v_suma_haber);
  END IF;

  -- 4. Insertar cabecera
  INSERT INTO accounting.journal_entries (
    org_id, tipo_evento, referencia_id, referencia_tabla,
    fecha, descripcion, idempotency_key, creado_por
  ) VALUES (
    p_org_id, p_tipo_evento, p_referencia_id, p_referencia_tabla,
    p_fecha, p_descripcion, p_idempotency_key, p_creado_por
  )
  RETURNING id INTO v_entry_id;

  -- 5. Insertar líneas
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    INSERT INTO accounting.journal_entry_lines (
      journal_entry_id, cuenta_id, debe, haber, descripcion
    ) VALUES (
      v_entry_id,
      (v_linea->>'cuenta_id')::UUID,
      COALESCE((v_linea->>'debe') ::NUMERIC(15,4), 0),
      COALESCE((v_linea->>'haber')::NUMERIC(15,4), 0),
      v_linea->>'descripcion'
    );
  END LOOP;

  RETURN v_entry_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- C2. create_informal_entry_transactional
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
  v_entry_id UUID;
  v_linea    JSONB;
BEGIN
  -- 1. Idempotencia
  SELECT id INTO v_entry_id
  FROM accounting.informal_entries
  WHERE idempotency_key = p_idempotency_key;

  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  -- 2. Validar líneas
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    IF v_linea->>'cuenta_id' IS NULL OR v_linea->>'cuenta_id' = '' THEN
      RAISE EXCEPTION 'Asiento informal rechazado: línea sin cuenta asignada.';
    END IF;
  END LOOP;

  -- 3. Insertar cabecera
  INSERT INTO accounting.informal_entries (
    org_id, tipo_evento, referencia_id, referencia_tabla,
    fecha, descripcion, idempotency_key, source_type, creado_por
  ) VALUES (
    p_org_id, p_tipo_evento, p_referencia_id, p_referencia_tabla,
    p_fecha, p_descripcion, p_idempotency_key, p_source_type, p_creado_por
  )
  RETURNING id INTO v_entry_id;

  -- 4. Insertar líneas
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    INSERT INTO accounting.informal_entry_lines (
      informal_entry_id, cuenta_id, debe, haber, descripcion
    ) VALUES (
      v_entry_id,
      (v_linea->>'cuenta_id')::UUID,
      COALESCE((v_linea->>'debe')::NUMERIC, 0),
      COALESCE((v_linea->>'haber')::NUMERIC, 0),
      v_linea->>'descripcion'
    );
  END LOOP;

  RETURN v_entry_id;
END;
$$;
