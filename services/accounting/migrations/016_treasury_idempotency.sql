SET search_path TO accounting, public;

CREATE TABLE IF NOT EXISTS accounting.treasury_operations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL,
  operation_key    TEXT        NOT NULL,
  operation_type   TEXT        NOT NULL,
  request_hash     TEXT        NOT NULL,
  result_table     TEXT,
  result_id        UUID,
  journal_entry_id UUID        REFERENCES accounting.journal_entries(id),
  movement_id      UUID        REFERENCES accounting.treasury_movements(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_treasury_operations_org_key UNIQUE (org_id, operation_key),
  CONSTRAINT chk_treasury_operations_type CHECK (
    operation_type IN (
      'BANK_MOVEMENT_CREATE',
      'RECEIVED_CHECK_CREATE',
      'RECEIVED_CHECK_REJECT',
      'ISSUED_CHECK_CREATE',
      'ISSUED_CHECK_DEBIT',
      'ISSUED_CHECK_REJECT',
      'CHECK_DEPOSIT_SLIP_CREATE',
      'CASH_DEPOSIT_SLIP_CREATE'
    )
  )
);

CREATE INDEX idx_treasury_operations_org_type
  ON accounting.treasury_operations (org_id, operation_type, created_at DESC);

ALTER TABLE accounting.treasury_movements
  ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES accounting.treasury_operations(id);

ALTER TABLE accounting.received_checks
  ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES accounting.treasury_operations(id);

ALTER TABLE accounting.issued_checks
  ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES accounting.treasury_operations(id);

ALTER TABLE accounting.treasury_deposit_slips
  ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES accounting.treasury_operations(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM accounting.treasury_movements
    WHERE journal_entry_id IS NOT NULL
    GROUP BY journal_entry_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se puede aplicar migration 016: hay movimientos de tesoreria que comparten journal_entry_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM accounting.treasury_deposit_slip_checks
    GROUP BY check_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se puede aplicar migration 016: hay cheques recibidos vinculados a mas de una boleta';
  END IF;
END $$;

INSERT INTO accounting.treasury_operations (
  org_id,
  operation_key,
  operation_type,
  request_hash,
  result_table,
  result_id,
  journal_entry_id,
  movement_id
)
SELECT
  tm.org_id,
  CONCAT('legacy:treasury_movement:', tm.id),
  'BANK_MOVEMENT_CREATE',
  md5(
    CONCAT_WS(
      '|',
      tm.org_id::text,
      tm.cuenta_bancaria_id::text,
      tm.tipo::text,
      tm.fecha::text,
      tm.descripcion,
      tm.importe::text,
      tm.lado::text,
      COALESCE(tm.referencia_id::text, ''),
      COALESCE(tm.referencia_tabla, '')
    )
  ),
  'treasury_movements',
  tm.id,
  tm.journal_entry_id,
  tm.id
FROM accounting.treasury_movements tm
WHERE tm.operation_id IS NULL
ON CONFLICT (org_id, operation_key) DO NOTHING;

UPDATE accounting.treasury_movements tm
SET operation_id = op.id
FROM accounting.treasury_operations op
WHERE tm.operation_id IS NULL
  AND op.org_id = tm.org_id
  AND op.operation_key = CONCAT('legacy:treasury_movement:', tm.id);

INSERT INTO accounting.treasury_operations (
  org_id,
  operation_key,
  operation_type,
  request_hash,
  result_table,
  result_id,
  journal_entry_id
)
SELECT
  rc.org_id,
  CONCAT('legacy:received_check:', rc.id),
  CASE WHEN rc.estado = 'RECHAZADO' THEN 'RECEIVED_CHECK_REJECT' ELSE 'RECEIVED_CHECK_CREATE' END,
  md5(
    CONCAT_WS(
      '|',
      rc.org_id::text,
      rc.numero_cheque,
      rc.banco_emisor,
      rc.importe::text,
      rc.fecha_emision::text,
      rc.fecha_vencimiento::text,
      COALESCE(rc.tipo::text, ''),
      COALESCE(rc.librador, '')
    )
  ),
  'received_checks',
  rc.id,
  rc.journal_entry_id
FROM accounting.received_checks rc
WHERE rc.operation_id IS NULL
ON CONFLICT (org_id, operation_key) DO NOTHING;

UPDATE accounting.received_checks rc
SET operation_id = op.id
FROM accounting.treasury_operations op
WHERE rc.operation_id IS NULL
  AND op.org_id = rc.org_id
  AND op.operation_key = CONCAT('legacy:received_check:', rc.id);

INSERT INTO accounting.treasury_operations (
  org_id,
  operation_key,
  operation_type,
  request_hash,
  result_table,
  result_id,
  journal_entry_id
)
SELECT
  ic.org_id,
  CONCAT('legacy:issued_check:', ic.id),
  CASE
    WHEN ic.estado = 'DEBITADO' THEN 'ISSUED_CHECK_DEBIT'
    WHEN ic.estado = 'RECHAZADO' THEN 'ISSUED_CHECK_REJECT'
    ELSE 'ISSUED_CHECK_CREATE'
  END,
  md5(
    CONCAT_WS(
      '|',
      ic.org_id::text,
      ic.cuenta_bancaria_id::text,
      ic.numero_cheque,
      ic.importe::text,
      ic.fecha_emision::text,
      ic.fecha_debito::text,
      ic.beneficiario,
      COALESCE(ic.tipo::text, ''),
      COALESCE(ic.referencia_pago_id::text, ''),
      COALESCE(ic.referencia_pago_tabla, '')
    )
  ),
  'issued_checks',
  ic.id,
  ic.journal_entry_id
FROM accounting.issued_checks ic
WHERE ic.operation_id IS NULL
ON CONFLICT (org_id, operation_key) DO NOTHING;

UPDATE accounting.issued_checks ic
SET operation_id = op.id
FROM accounting.treasury_operations op
WHERE ic.operation_id IS NULL
  AND op.org_id = ic.org_id
  AND op.operation_key = CONCAT('legacy:issued_check:', ic.id);

INSERT INTO accounting.treasury_operations (
  org_id,
  operation_key,
  operation_type,
  request_hash,
  result_table,
  result_id,
  journal_entry_id
)
SELECT
  ds.org_id,
  CONCAT('legacy:deposit_slip:', ds.id),
  CASE WHEN ds.tipo = 'CHEQUES' THEN 'CHECK_DEPOSIT_SLIP_CREATE' ELSE 'CASH_DEPOSIT_SLIP_CREATE' END,
  md5(
    CONCAT_WS(
      '|',
      ds.org_id::text,
      ds.cuenta_bancaria_id::text,
      ds.tipo::text,
      ds.fecha::text,
      ds.importe_total::text,
      ds.descripcion,
      COALESCE(ds.cuenta_caja_code, '')
    )
  ),
  'treasury_deposit_slips',
  ds.id,
  ds.journal_entry_id
FROM accounting.treasury_deposit_slips ds
WHERE ds.operation_id IS NULL
ON CONFLICT (org_id, operation_key) DO NOTHING;

UPDATE accounting.treasury_deposit_slips ds
SET operation_id = op.id
FROM accounting.treasury_operations op
WHERE ds.operation_id IS NULL
  AND op.org_id = ds.org_id
  AND op.operation_key = CONCAT('legacy:deposit_slip:', ds.id);

ALTER TABLE accounting.treasury_movements
  ALTER COLUMN operation_id SET NOT NULL;

ALTER TABLE accounting.received_checks
  ALTER COLUMN operation_id SET NOT NULL;

ALTER TABLE accounting.issued_checks
  ALTER COLUMN operation_id SET NOT NULL;

ALTER TABLE accounting.treasury_deposit_slips
  ALTER COLUMN operation_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_movements_operation
  ON accounting.treasury_movements (operation_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_received_checks_operation
  ON accounting.received_checks (operation_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_issued_checks_operation
  ON accounting.issued_checks (operation_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_deposit_slips_operation
  ON accounting.treasury_deposit_slips (operation_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_movements_journal_entry
  ON accounting.treasury_movements (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_deposit_slip_checks_check_id
  ON accounting.treasury_deposit_slip_checks (check_id);

CREATE OR REPLACE FUNCTION accounting.set_treasury_operation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_treasury_operations_updated_at
  ON accounting.treasury_operations;

CREATE TRIGGER trg_treasury_operations_updated_at
BEFORE UPDATE ON accounting.treasury_operations
FOR EACH ROW
EXECUTE FUNCTION accounting.set_treasury_operation_updated_at();