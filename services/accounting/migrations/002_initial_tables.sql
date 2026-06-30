-- ============================================================
-- 002_initial_tables.sql
-- Tablas del módulo contable dentro del schema accounting
--
-- Prerequisito: 001_create_schema.sql ejecutado
-- ============================================================

SET search_path TO accounting, public;

-- ------------------------------------------------------------
-- Plan de cuentas
-- ------------------------------------------------------------
CREATE TABLE accounting.chart_of_accounts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID        NOT NULL,
  codigo              TEXT        NOT NULL,
  nombre              TEXT        NOT NULL,
  account_code        TEXT        UNIQUE,        -- código semántico estable (ej: AR_CLIENTES)
  tipo                TEXT        NOT NULL CHECK (tipo IN ('ACTIVO','PASIVO','PN','INGRESO','EGRESO')),
  naturaleza          TEXT        NOT NULL CHECK (naturaleza IN ('DEUDORA','ACREEDORA')),
  permite_movimientos BOOLEAN     NOT NULL DEFAULT true,
  activa              BOOLEAN     NOT NULL DEFAULT true,
  padre_id            UUID        REFERENCES accounting.chart_of_accounts(id),
  creado_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, codigo)
);

-- ------------------------------------------------------------
-- Reglas contables
-- ------------------------------------------------------------
CREATE TABLE accounting.accounting_rules (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID    NOT NULL,
  tipo_evento TEXT    NOT NULL,   -- VENTA, COMPRA, COBRO, PAGO, NOTA_CREDITO
  condicion   JSONB,              -- null = catch-all; { condicionVenta: "CREDITO" } = condicional
  activa      BOOLEAN NOT NULL DEFAULT true,
  es_fija     BOOLEAN NOT NULL DEFAULT true,
  descripcion TEXT,
  prioridad   INTEGER NOT NULL DEFAULT 0
);

-- Líneas de reglas
CREATE TABLE accounting.accounting_rule_lines (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id          UUID    NOT NULL REFERENCES accounting.accounting_rules(id) ON DELETE CASCADE,
  account_code     TEXT,          -- null en líneas seleccionables
  lado             TEXT    NOT NULL CHECK (lado IN ('DEBE','HABER')),
  formula          TEXT    NOT NULL,  -- ej: "datos.montoNeto" o "datos.montoNeto+datos.montoIVA21"
  es_seleccionable BOOLEAN NOT NULL DEFAULT false,
  opciones_cuenta  JSONB           -- [{ accountCode, label }] — solo si es_seleccionable
);

-- ------------------------------------------------------------
-- Cabecera del asiento contable
-- ------------------------------------------------------------
CREATE TABLE accounting.journal_entries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL,
  numero            BIGINT      GENERATED ALWAYS AS IDENTITY UNIQUE,
  fecha             DATE        NOT NULL,
  descripcion       TEXT,
  tipo_evento       TEXT,
  referencia_id     UUID,
  referencia_tabla  TEXT,
  estado            TEXT        NOT NULL DEFAULT 'ACTIVO'    CHECK (estado IN ('ACTIVO','ANULADO')),
  estado_imputacion TEXT        NOT NULL DEFAULT 'COMPLETO'  CHECK (estado_imputacion IN ('COMPLETO','SUSPENSO')),
  idempotency_key   TEXT        NOT NULL UNIQUE,
  creado_por        UUID,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anulado_por_id    UUID        REFERENCES accounting.journal_entries(id)
);

-- Líneas del asiento
CREATE TABLE accounting.journal_entry_lines (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id     UUID         NOT NULL REFERENCES accounting.journal_entries(id) ON DELETE CASCADE,
  cuenta_id            UUID         REFERENCES accounting.chart_of_accounts(id),
  debe                 NUMERIC(15,4) NOT NULL DEFAULT 0,
  haber                NUMERIC(15,4) NOT NULL DEFAULT 0,
  descripcion          TEXT,
  pendiente_imputacion BOOLEAN      NOT NULL DEFAULT false,
  CONSTRAINT una_sola_columna CHECK (
    (debe > 0 AND haber = 0) OR
    (haber > 0 AND debe = 0) OR
    (debe = 0 AND haber = 0)
  )
);

-- ------------------------------------------------------------
-- Eventos pendientes (contingencia fire-and-forget)
-- ------------------------------------------------------------
CREATE TABLE accounting.accounting_pending_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL,
  tipo_evento      TEXT        NOT NULL,
  referencia_id    UUID        NOT NULL,
  referencia_tabla TEXT        NOT NULL,
  payload          JSONB       NOT NULL,
  estado           TEXT        NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PROCESADO','ERROR')),
  intentos         INTEGER     NOT NULL DEFAULT 0,
  ultimo_error     TEXT,
  idempotency_key  TEXT        NOT NULL UNIQUE,
  creado_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  procesado_at     TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
CREATE INDEX idx_chart_account_code          ON accounting.chart_of_accounts(account_code);
CREATE INDEX idx_chart_org_activa            ON accounting.chart_of_accounts(org_id, activa);
CREATE INDEX idx_rules_org_evento            ON accounting.accounting_rules(org_id, tipo_evento, activa);
CREATE INDEX idx_journal_entries_org_fecha   ON accounting.journal_entries(org_id, fecha);
CREATE INDEX idx_journal_entries_tipo_ref    ON accounting.journal_entries(tipo_evento, referencia_id);
CREATE INDEX idx_journal_entries_idempotency ON accounting.journal_entries(idempotency_key);
CREATE INDEX idx_journal_entries_suspenso    ON accounting.journal_entries(org_id, estado_imputacion) WHERE estado_imputacion = 'SUSPENSO';
CREATE INDEX idx_entry_lines_entry           ON accounting.journal_entry_lines(journal_entry_id);
CREATE INDEX idx_entry_lines_cuenta          ON accounting.journal_entry_lines(cuenta_id);
CREATE INDEX idx_pending_events_estado       ON accounting.accounting_pending_events(estado, creado_at);

-- ------------------------------------------------------------
-- Row Level Security
-- Deny-all para roles anon/authenticated: ningún cliente JWT debe
-- acceder directamente a estas tablas.
-- El servicio contable conecta como `postgres` (superuser) y bypasea
-- RLS automáticamente — no se necesitan policies adicionales.
-- ------------------------------------------------------------
ALTER TABLE accounting.chart_of_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.accounting_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.accounting_rule_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.journal_entries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.journal_entry_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.accounting_pending_events  ENABLE ROW LEVEL SECURITY;

-- Verificar
SELECT table_name FROM information_schema.tables WHERE table_schema = 'accounting' ORDER BY table_name;
