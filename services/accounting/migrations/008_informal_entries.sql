-- ============================================================
-- 008_informal_entries.sql
-- Tablas para asientos informales (previo a formalización)
--
-- Prerequisito: 002_initial_tables.sql ejecutado
-- ============================================================

SET search_path TO accounting, public;

-- ------------------------------------------------------------
-- Cabecera del asiento informal
-- Misma estructura que journal_entries + columnas de estado informal
-- ------------------------------------------------------------
CREATE TABLE accounting.informal_entries (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID        NOT NULL,
  fecha                       DATE        NOT NULL,
  descripcion                 TEXT,
  tipo_evento                 TEXT,
  referencia_id               UUID,
  referencia_tabla            TEXT,
  estado                      TEXT        NOT NULL DEFAULT 'ACTIVO'    CHECK (estado IN ('ACTIVO','ANULADO')),
  estado_imputacion           TEXT        NOT NULL DEFAULT 'COMPLETO'  CHECK (estado_imputacion IN ('COMPLETO','SUSPENSO')),
  idempotency_key             TEXT        NOT NULL UNIQUE,
  creado_por                  UUID,
  creado_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Columnas extra del asiento informal
  source_type                 TEXT        NOT NULL CHECK (source_type IN ('NOTA_DE_VENTA','FACTURA_PENDIENTE')),
  estado_formalizacion        TEXT        NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_formalizacion IN ('PENDIENTE','FORMALIZADO','CANCELADO')),
  formalized_journal_entry_id UUID        REFERENCES accounting.journal_entries(id)
);

-- Índices útiles para filtrado
CREATE INDEX ON accounting.informal_entries (org_id, estado_formalizacion);
CREATE INDEX ON accounting.informal_entries (org_id, source_type);
CREATE INDEX ON accounting.informal_entries (referencia_id);

-- ------------------------------------------------------------
-- Líneas del asiento informal
-- Misma estructura que journal_entry_lines
-- ------------------------------------------------------------
CREATE TABLE accounting.informal_entry_lines (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  informal_entry_id    UUID          NOT NULL REFERENCES accounting.informal_entries(id) ON DELETE CASCADE,
  cuenta_id            UUID          REFERENCES accounting.chart_of_accounts(id),
  debe                 NUMERIC(15,4) NOT NULL DEFAULT 0,
  haber                NUMERIC(15,4) NOT NULL DEFAULT 0,
  descripcion          TEXT,
  pendiente_imputacion BOOLEAN       NOT NULL DEFAULT false,
  CONSTRAINT informal_entry_lines_debe_o_haber
    CHECK ((debe > 0 AND haber = 0) OR (haber > 0 AND debe = 0) OR (debe = 0 AND haber = 0))
);
