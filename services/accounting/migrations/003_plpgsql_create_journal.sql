-- ============================================================
-- 003_plpgsql_create_journal.sql
-- Función transaccional para crear asientos contables
--
-- Prerequisito: 002_initial_tables.sql ejecutado
-- ============================================================

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
  v_entry_id       UUID;
  v_linea          JSONB;
  v_suma_debe      NUMERIC(15,4) := 0;
  v_suma_haber     NUMERIC(15,4) := 0;
  v_tiene_suspenso BOOLEAN       := false;
  v_estado_imput   TEXT          := 'COMPLETO';
BEGIN
  -- 1. Idempotencia: si la clave ya fue procesada, retorna el id existente sin error
  SELECT id INTO v_entry_id
  FROM accounting.journal_entries
  WHERE idempotency_key = p_idempotency_key;

  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  -- 2. Clasificar líneas: detectar suspenso y acumular balance de las líneas con cuenta
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    IF (v_linea->>'pendiente_imputacion')::BOOLEAN IS TRUE
       OR v_linea->>'cuenta_id' IS NULL
       OR v_linea->>'cuenta_id' = ''
    THEN
      v_tiene_suspenso := true;
    ELSE
      v_suma_debe  := v_suma_debe  + COALESCE((v_linea->>'debe') ::NUMERIC, 0);
      v_suma_haber := v_suma_haber + COALESCE((v_linea->>'haber')::NUMERIC, 0);
    END IF;
  END LOOP;

  -- 3. Verificar balance — solo sobre líneas con cuenta asignada
  --    Los asientos SUSPENSO se permiten desbalanceados porque faltan cuentas
  IF NOT v_tiene_suspenso AND ABS(v_suma_debe - v_suma_haber) > 0.001 THEN
    RAISE EXCEPTION 'Asiento desbalanceado: debe=% haber=% diferencia=%',
      v_suma_debe, v_suma_haber, ABS(v_suma_debe - v_suma_haber);
  END IF;

  -- 4. Derivar estado de imputación
  IF v_tiene_suspenso THEN
    v_estado_imput := 'SUSPENSO';
  END IF;

  -- 5. Insertar cabecera del asiento
  INSERT INTO accounting.journal_entries (
    org_id,
    tipo_evento,
    referencia_id,
    referencia_tabla,
    fecha,
    descripcion,
    idempotency_key,
    estado_imputacion,
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
    p_creado_por
  )
  RETURNING id INTO v_entry_id;

  -- 6. Insertar líneas
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    INSERT INTO accounting.journal_entry_lines (
      journal_entry_id,
      cuenta_id,
      debe,
      haber,
      descripcion,
      pendiente_imputacion
    ) VALUES (
      v_entry_id,
      NULLIF(v_linea->>'cuenta_id', '')::UUID,
      COALESCE((v_linea->>'debe') ::NUMERIC(15,4), 0),
      COALESCE((v_linea->>'haber')::NUMERIC(15,4), 0),
      v_linea->>'descripcion',
      COALESCE((v_linea->>'pendiente_imputacion')::BOOLEAN, false)
    );
  END LOOP;

  RETURN v_entry_id;

EXCEPTION WHEN OTHERS THEN
  RAISE; -- re-raise para que el caller haga rollback automático
END;
$$;

-- Verificar
SELECT proname, pronargs
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'accounting' AND p.proname = 'create_journal_entry_transactional';
