-- ============================================================
-- 004_plpgsql_contra_asiento.sql
-- Función para generar contra-asientos (reversión de asientos confirmados)
-- Usada en Fase 2 por el stepper transaccional
--
-- Prerequisito: 003_plpgsql_create_journal.sql ejecutado
-- ============================================================

CREATE OR REPLACE FUNCTION accounting.create_contra_entry(
  p_original_id     UUID,
  p_descripcion     TEXT,
  p_idempotency_key TEXT,
  p_creado_por      UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_original accounting.journal_entries%ROWTYPE;
  v_lineas   JSONB := '[]'::JSONB;
  v_linea    accounting.journal_entry_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_original
  FROM accounting.journal_entries
  WHERE id = p_original_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asiento original no encontrado: %', p_original_id;
  END IF;

  IF v_original.estado = 'ANULADO' THEN
    RAISE EXCEPTION 'El asiento % ya está anulado', p_original_id;
  END IF;

  -- Invertir DEBE/HABER de cada línea del asiento original
  FOR v_linea IN
    SELECT * FROM accounting.journal_entry_lines
    WHERE journal_entry_id = p_original_id
    ORDER BY id
  LOOP
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id',            v_linea.cuenta_id,
      'debe',                 v_linea.haber,   -- invertido
      'haber',                v_linea.debe,    -- invertido
      'descripcion',          v_linea.descripcion,
      'pendiente_imputacion', false
    );
  END LOOP;

  -- Crear el contra-asiento reutilizando la función transaccional
  RETURN accounting.create_journal_entry_transactional(
    v_original.org_id,
    'CONTRA_ASIENTO',
    p_original_id,
    'accounting.journal_entries',
    CURRENT_DATE,
    p_descripcion,
    v_lineas,
    p_idempotency_key,
    p_creado_por
  );
END;
$$;

-- Verificar
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'accounting' AND p.proname = 'create_contra_entry';
