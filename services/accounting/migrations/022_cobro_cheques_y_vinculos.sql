-- ============================================================
-- 022_cobro_cheques_y_vinculos.sql
-- Habilita VALORES_A_DEPOSITAR para cobros con cheque y endurece
-- el vínculo opcional entre cobranzas y cheques recibidos.
-- ============================================================

SET search_path TO accounting, public;

DO $$
DECLARE
  v_org RECORD;
  v_method TEXT;
  v_rule_id UUID;
  v_priority INTEGER;
BEGIN
  FOR v_org IN SELECT DISTINCT org_id FROM accounting.chart_of_accounts LOOP
    FOREACH v_method IN ARRAY ARRAY['CHEQUE', 'E-CHEQ'] LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM accounting.accounting_rules
        WHERE org_id = v_org.org_id
          AND tipo_evento = 'COBRO'
          AND condicion = jsonb_build_object('metodoPago', v_method)
      ) THEN
        SELECT COALESCE(MAX(prioridad), 0) + 100
        INTO v_priority
        FROM accounting.accounting_rules
        WHERE org_id = v_org.org_id AND tipo_evento = 'COBRO';

        INSERT INTO accounting.accounting_rules
          (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
        VALUES
          (v_org.org_id, 'COBRO', jsonb_build_object('metodoPago', v_method), true, true,
           'Cobro con cheque — DEBE valores a depositar, HABER deudores', v_priority)
        RETURNING id INTO v_rule_id;

        INSERT INTO accounting.accounting_rule_lines
          (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
        VALUES
          (v_rule_id, 'VALORES_A_DEPOSITAR', 'DEBE', 'datos.montoCobrado', false, NULL),
          (v_rule_id, 'AR_DEUDORES_VENTAS', 'HABER', 'datos.montoCobrado', false, NULL);
      END IF;
    END LOOP;
  END LOOP;
END $$;

UPDATE accounting.received_checks AS check_row
SET receivable_payment_id = NULL
WHERE check_row.receivable_payment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.receivable_payments AS payment
    WHERE payment.id = check_row.receivable_payment_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_received_checks_receivable_payment
  ON accounting.received_checks (receivable_payment_id)
  WHERE receivable_payment_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_received_checks_receivable_payment'
      AND conrelid = 'accounting.received_checks'::regclass
  ) THEN
    ALTER TABLE accounting.received_checks
      ADD CONSTRAINT fk_received_checks_receivable_payment
      FOREIGN KEY (receivable_payment_id)
      REFERENCES public.receivable_payments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_credits_source_payment
  ON public.customer_credits (source_payment_id)
  WHERE source_payment_id IS NOT NULL;