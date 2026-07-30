-- ============================================================
-- 013_create_treasury_module.sql
--
-- Objetivo:
--   Crear las tablas operativas del módulo de Tesorería en el
--   esquema `accounting`. Estas tablas son la fuente autoritativa
--   para saldos bancarios operativos, carteras de cheques y
--   boletas de depósito.
--
-- NOTA: Las tablas public.bank_accounts, public.bank_movements y
--   public.issued_checks ya existen en el schema público con una
--   estructura más simple. Las tablas aquí creadas son independientes
--   y representan el ledger operativo integrado con el sistema contable.
-- ============================================================

SET search_path TO accounting, public;

-- ============================================================
-- 1. CUENTAS BANCARIAS OPERATIVAS
-- ============================================================

CREATE TABLE IF NOT EXISTS accounting.treasury_bank_accounts (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID        NOT NULL,
  nombre             TEXT        NOT NULL,
  banco              TEXT        NOT NULL,
  numero_cuenta      TEXT,
  alias              TEXT,
  moneda             TEXT        NOT NULL DEFAULT 'ARS'
                                   CHECK (moneda IN ('ARS', 'USD')),
  saldo_operativo    NUMERIC(15, 4) NOT NULL DEFAULT 0,
  activa             BOOLEAN     NOT NULL DEFAULT TRUE,
  cuenta_contable_id UUID        NOT NULL
                                   REFERENCES accounting.chart_of_accounts(id),
  descripcion        TEXT,
  creado_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_treasury_bank_accounts_nombre_org UNIQUE (org_id, nombre)
);

CREATE INDEX idx_tba_org_id  ON accounting.treasury_bank_accounts (org_id);
CREATE INDEX idx_tba_activa  ON accounting.treasury_bank_accounts (org_id, activa);

-- ============================================================
-- 2. MOVIMIENTOS BANCARIOS (ledger operativo)
-- ============================================================

CREATE TYPE accounting.treasury_movement_tipo AS ENUM (
  'DEBITO_BANCARIO',
  'CREDITO_BANCARIO',
  'CHEQUE_RECIBIDO_RECHAZADO',
  'CHEQUE_PROPIO_RECHAZADO',
  'DEPOSITO_CHEQUES',
  'DEPOSITO_EFECTIVO',
  'DEBITO_CHEQUE_PROPIO'
);

CREATE TABLE IF NOT EXISTS accounting.treasury_movements (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID        NOT NULL,
  cuenta_bancaria_id UUID        NOT NULL
                                   REFERENCES accounting.treasury_bank_accounts(id),
  tipo               accounting.treasury_movement_tipo NOT NULL,
  fecha              DATE        NOT NULL,
  descripcion        TEXT        NOT NULL,
  importe            NUMERIC(15, 4) NOT NULL CHECK (importe > 0),
  lado               TEXT        NOT NULL CHECK (lado IN ('DEBE', 'HABER')),
  journal_entry_id   UUID        REFERENCES accounting.journal_entries(id),
  referencia_id      UUID,
  referencia_tabla   TEXT,
  estado             TEXT        NOT NULL DEFAULT 'ACTIVO'
                                   CHECK (estado IN ('ACTIVO', 'ANULADO')),
  creado_por         UUID,
  creado_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tm_org_id   ON accounting.treasury_movements (org_id);
CREATE INDEX idx_tm_cuenta   ON accounting.treasury_movements (cuenta_bancaria_id);
CREATE INDEX idx_tm_fecha    ON accounting.treasury_movements (org_id, fecha DESC);

-- ============================================================
-- 3. CARTERA DE CHEQUES RECIBIDOS
-- ============================================================

CREATE TYPE accounting.received_check_estado AS ENUM (
  'EN_CARTERA',
  'DEPOSITADO',
  'RECHAZADO',
  'ANULADO'
);

CREATE TABLE IF NOT EXISTS accounting.received_checks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL,
  numero_cheque     TEXT        NOT NULL,
  banco_emisor      TEXT        NOT NULL,
  importe           NUMERIC(15, 4) NOT NULL CHECK (importe > 0),
  fecha_emision     DATE        NOT NULL,
  fecha_vencimiento DATE        NOT NULL,
  librador          TEXT,
  librador_id       UUID,
  notas             TEXT,
  estado            accounting.received_check_estado NOT NULL DEFAULT 'EN_CARTERA',
  deposit_slip_id   UUID,
  journal_entry_id  UUID        REFERENCES accounting.journal_entries(id),
  creado_por        UUID,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rc_org_id ON accounting.received_checks (org_id);
CREATE INDEX idx_rc_estado ON accounting.received_checks (org_id, estado);

-- ============================================================
-- 4. CARTERA DE CHEQUES EMITIDOS (propios)
-- ============================================================

CREATE TYPE accounting.issued_check_estado AS ENUM (
  'EMITIDO',
  'DEBITADO',
  'RECHAZADO',
  'ANULADO'
);

CREATE TABLE IF NOT EXISTS accounting.issued_checks (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL,
  cuenta_bancaria_id    UUID        NOT NULL
                                       REFERENCES accounting.treasury_bank_accounts(id),
  numero_cheque         TEXT        NOT NULL,
  importe               NUMERIC(15, 4) NOT NULL CHECK (importe > 0),
  fecha_emision         DATE        NOT NULL,
  fecha_debito          DATE        NOT NULL,
  beneficiario          TEXT        NOT NULL,
  beneficiario_id       UUID,
  notas                 TEXT,
  estado                accounting.issued_check_estado NOT NULL DEFAULT 'EMITIDO',
  referencia_pago_id    UUID,
  referencia_pago_tabla TEXT,
  journal_entry_id      UUID        REFERENCES accounting.journal_entries(id),
  creado_por            UUID,
  creado_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_issued_checks_numero_cuenta
    UNIQUE (org_id, cuenta_bancaria_id, numero_cheque)
);

CREATE INDEX idx_ic_org_id      ON accounting.issued_checks (org_id);
CREATE INDEX idx_ic_estado      ON accounting.issued_checks (org_id, estado);
CREATE INDEX idx_ic_cuenta      ON accounting.issued_checks (cuenta_bancaria_id);
CREATE INDEX idx_ic_fecha_debito ON accounting.issued_checks (org_id, fecha_debito);

-- ============================================================
-- 5. BOLETAS DE DEPÓSITO
-- ============================================================

CREATE TYPE accounting.deposit_slip_tipo AS ENUM (
  'CHEQUES',
  'EFECTIVO'
);

CREATE TYPE accounting.deposit_slip_estado AS ENUM (
  'CONFIRMADA',
  'ANULADA'
);

CREATE TABLE IF NOT EXISTS accounting.treasury_deposit_slips (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID        NOT NULL,
  cuenta_bancaria_id UUID        NOT NULL
                                   REFERENCES accounting.treasury_bank_accounts(id),
  tipo               accounting.deposit_slip_tipo   NOT NULL,
  fecha              DATE        NOT NULL,
  importe_total      NUMERIC(15, 4) NOT NULL CHECK (importe_total > 0),
  descripcion        TEXT        NOT NULL,
  cuenta_caja_code   TEXT,
  journal_entry_id   UUID        REFERENCES accounting.journal_entries(id),
  estado             accounting.deposit_slip_estado NOT NULL DEFAULT 'CONFIRMADA',
  creado_por         UUID,
  creado_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ds_org_id  ON accounting.treasury_deposit_slips (org_id);
CREATE INDEX idx_ds_cuenta  ON accounting.treasury_deposit_slips (cuenta_bancaria_id);
CREATE INDEX idx_ds_fecha   ON accounting.treasury_deposit_slips (org_id, fecha DESC);

-- ============================================================
-- 6. RELACIÓN BOLETA ↔ CHEQUES RECIBIDOS
-- ============================================================

CREATE TABLE IF NOT EXISTS accounting.treasury_deposit_slip_checks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_slip_id UUID        NOT NULL
                                REFERENCES accounting.treasury_deposit_slips(id)
                                ON DELETE CASCADE,
  check_id        UUID        NOT NULL
                                REFERENCES accounting.received_checks(id),
  importe         NUMERIC(15, 4) NOT NULL CHECK (importe > 0),

  CONSTRAINT uq_slip_check UNIQUE (deposit_slip_id, check_id)
);

CREATE INDEX idx_dsc_slip_id  ON accounting.treasury_deposit_slip_checks (deposit_slip_id);
CREATE INDEX idx_dsc_check_id ON accounting.treasury_deposit_slip_checks (check_id);

-- ============================================================
-- 7. TRIGGERS — actualizado_at
-- ============================================================

CREATE OR REPLACE FUNCTION accounting.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tba_updated_at
  BEFORE UPDATE ON accounting.treasury_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION accounting.set_updated_at();

CREATE TRIGGER trg_rc_updated_at
  BEFORE UPDATE ON accounting.received_checks
  FOR EACH ROW EXECUTE FUNCTION accounting.set_updated_at();

CREATE TRIGGER trg_ic_updated_at
  BEFORE UPDATE ON accounting.issued_checks
  FOR EACH ROW EXECUTE FUNCTION accounting.set_updated_at();
