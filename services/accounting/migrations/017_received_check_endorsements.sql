SET search_path TO accounting, public;

ALTER TYPE accounting.received_check_estado
  ADD VALUE IF NOT EXISTS 'ENDOSADO';

ALTER TABLE accounting.treasury_operations
  DROP CONSTRAINT IF EXISTS chk_treasury_operations_type;

ALTER TABLE accounting.treasury_operations
  ADD CONSTRAINT chk_treasury_operations_type CHECK (
    operation_type IN (
      'BANK_MOVEMENT_CREATE',
      'RECEIVED_CHECK_CREATE',
      'RECEIVED_CHECK_REJECT',
      'ISSUED_CHECK_CREATE',
      'ISSUED_CHECK_DEBIT',
      'ISSUED_CHECK_REJECT',
      'CHECK_DEPOSIT_SLIP_CREATE',
      'CASH_DEPOSIT_SLIP_CREATE',
      'RECEIVED_CHECK_ENDORSEMENT'
    )
  );

CREATE TABLE IF NOT EXISTS accounting.received_check_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  received_check_id UUID NOT NULL
    REFERENCES accounting.received_checks(id),
  payable_payment_id UUID NOT NULL,
  account_payable_id UUID NOT NULL
    REFERENCES public.accounts_payable(id),
  supplier_id UUID NOT NULL
    REFERENCES public.suppliers(id),
  operation_id UUID NOT NULL
    REFERENCES accounting.treasury_operations(id),
  endorsement_date DATE NOT NULL,
  amount_snapshot NUMERIC(15, 4) NOT NULL CHECK (amount_snapshot > 0),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_received_check_endorsements_check UNIQUE (received_check_id)
);

CREATE INDEX IF NOT EXISTS idx_rce_org
  ON accounting.received_check_endorsements (org_id, endorsement_date DESC);

CREATE INDEX IF NOT EXISTS idx_rce_payment
  ON accounting.received_check_endorsements (payable_payment_id);

CREATE INDEX IF NOT EXISTS idx_rce_supplier
  ON accounting.received_check_endorsements (supplier_id, endorsement_date DESC);

CREATE INDEX IF NOT EXISTS idx_rce_operation
  ON accounting.received_check_endorsements (operation_id);

DO $$
DECLARE
  option_payload JSONB :=
    '{"accountCode":"VALORES_A_DEPOSITAR","label":"Valores a Depositar"}'::jsonb;
BEGIN
  UPDATE accounting.accounting_rule_lines line
  SET opciones_cuenta = COALESCE(line.opciones_cuenta, '[]'::jsonb) || option_payload
  FROM accounting.accounting_rules rule
  WHERE line.rule_id = rule.id
    AND rule.tipo_evento = 'ORDEN_PAGO'
    AND line.lado = 'HABER'
    AND line.es_seleccionable = TRUE
    AND NOT COALESCE(line.opciones_cuenta, '[]'::jsonb) @> jsonb_build_array(option_payload);
END $$;

DROP TRIGGER IF EXISTS trg_rce_updated_at ON accounting.received_check_endorsements;

CREATE TRIGGER trg_rce_updated_at
  BEFORE UPDATE ON accounting.received_check_endorsements
  FOR EACH ROW EXECUTE FUNCTION accounting.set_updated_at();