-- ============================================================
-- 014_treasury_accounting_rules.sql
--
-- Objetivo:
--   1. Migrar account_code de UNIQUE global a UNIQUE(org_id, account_code)
--      para soportar multi-org correctamente.
--   2. Agregar cuentas semánticas de Tesorería al plan de cuentas
--      de todas las organizaciones que ya tengan un plan configurado.
--   3. Agregar reglas contables para los 7 tipos de eventos de
--      Tesorería: MOVIMIENTO_BANCARIO_DEBITO, MOVIMIENTO_BANCARIO_CREDITO,
--      CHEQUE_RECIBIDO_RECHAZADO, CHEQUE_PROPIO_RECHAZADO,
--      DEPOSITO_CHEQUES, DEPOSITO_EFECTIVO, DEBITO_CHEQUE_PROPIO.
-- ============================================================

SET search_path TO accounting, public;

-- ── Paso 1: migrar constraint account_code de global a por-org ──────────────
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Buscar el nombre del constraint global sobre account_code (una sola columna)
  SELECT c.conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
  WHERE n.nspname = 'accounting'
    AND t.relname = 'chart_of_accounts'
    AND c.contype = 'u'
    AND a.attname = 'account_code'
    AND array_length(c.conkey, 1) = 1
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE accounting.chart_of_accounts DROP CONSTRAINT ' || quote_ident(v_constraint_name);
  END IF;

  -- Agregar constraint por-org solo si no existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'accounting'
      AND t.relname = 'chart_of_accounts'
      AND c.contype = 'u'
      AND c.conname = 'uq_chart_of_accounts_org_account_code'
  ) THEN
    ALTER TABLE accounting.chart_of_accounts
      ADD CONSTRAINT uq_chart_of_accounts_org_account_code
      UNIQUE (org_id, account_code);
  END IF;
END $$;

-- ── Paso 2: cuentas y reglas de Tesorería por organización ──────────────────
DO $$
DECLARE
  v_org       RECORD;
  v_regla_id  UUID;

  v_opciones_banco JSONB := '[
    {"accountCode": "BANCO_BBVA_PESOS",        "label": "Banco BBVA Pesos"},
    {"accountCode": "BANCO_SUPERVIELLE_PESOS",  "label": "Banco Supervielle Pesos"},
    {"accountCode": "MERCADO_PAGO",             "label": "Mercado Pago"},
    {"accountCode": "CALFPAY",                  "label": "Calfpay"}
  ]'::JSONB;

  v_opciones_caja_y_banco JSONB := '[
    {"accountCode": "CAJA_PESOS",              "label": "Caja Pesos"},
    {"accountCode": "BANCO_BBVA_PESOS",        "label": "Banco BBVA Pesos"},
    {"accountCode": "BANCO_SUPERVIELLE_PESOS", "label": "Banco Supervielle Pesos"},
    {"accountCode": "MERCADO_PAGO",            "label": "Mercado Pago"},
    {"accountCode": "CALFPAY",                 "label": "Calfpay"}
  ]'::JSONB;

  v_opciones_gastos JSONB := '[
    {"accountCode": "CHEQUES_RECHAZADOS",     "label": "Cheques Rechazados"},
    {"accountCode": "GASTOS_BANCARIOS",       "label": "Gastos Bancarios"},
    {"accountCode": "IIBB_GASTO",             "label": "IIBB Gasto"},
    {"accountCode": "OTROS_INGRESOS",         "label": "Otros Ingresos / Egresos"},
    {"accountCode": "DESCUENTOS_OTORGADOS",   "label": "Descuentos Otorgados"},
    {"accountCode": "INTERESES_FINANCIEROS",  "label": "Intereses Financieros"}
  ]'::JSONB;

BEGIN

  -- ============================================================
  -- Iterar sobre cada organización que tenga plan de cuentas
  -- ============================================================
  FOR v_org IN
    SELECT DISTINCT org_id FROM accounting.chart_of_accounts
  LOOP

    -- ──────────────────────────────────────────────────────────
    -- 1. CUENTAS DE TESORERÍA
    -- ──────────────────────────────────────────────────────────

    -- Cuentas de Tesorería — idempotentes por (org_id, account_code)
    INSERT INTO accounting.chart_of_accounts
      (org_id, codigo, nombre, account_code, tipo, naturaleza, permite_movimientos, activa)
    VALUES
      (v_org.org_id, '1.1.15', 'Valores a Depositar',
       'VALORES_A_DEPOSITAR', 'ACTIVO', 'DEUDORA', true, true)
    ON CONFLICT (org_id, account_code) DO NOTHING;

    INSERT INTO accounting.chart_of_accounts
      (org_id, codigo, nombre, account_code, tipo, naturaleza, permite_movimientos, activa)
    VALUES
      (v_org.org_id, '2.1.05', 'Valores a Pagar',
       'VALORES_A_PAGAR', 'PASIVO', 'ACREEDORA', true, true)
    ON CONFLICT (org_id, account_code) DO NOTHING;

    INSERT INTO accounting.chart_of_accounts
      (org_id, codigo, nombre, account_code, tipo, naturaleza, permite_movimientos, activa)
    VALUES
      (v_org.org_id, '1.1.16', 'Cheques Rechazados',
       'CHEQUES_RECHAZADOS', 'ACTIVO', 'DEUDORA', true, true)
    ON CONFLICT (org_id, account_code) DO NOTHING;

    INSERT INTO accounting.chart_of_accounts
      (org_id, codigo, nombre, account_code, tipo, naturaleza, permite_movimientos, activa)
    VALUES
      (v_org.org_id, '4.1.05', 'Gastos Bancarios',
       'GASTOS_BANCARIOS', 'EGRESO', 'DEUDORA', true, true)
    ON CONFLICT (org_id, account_code) DO NOTHING;

    -- ──────────────────────────────────────────────────────────
    -- 2. REGLAS CONTABLES DE TESORERÍA
    -- ──────────────────────────────────────────────────────────

    -- Reglas contables — WHERE NOT EXISTS porque accounting_rules no tiene UNIQUE constraint

    -- MOVIMIENTO_BANCARIO_DEBITO
    IF NOT EXISTS (
      SELECT 1 FROM accounting.accounting_rules
      WHERE org_id = v_org.org_id AND tipo_evento = 'MOVIMIENTO_BANCARIO_DEBITO'
    ) THEN
      INSERT INTO accounting.accounting_rules
        (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
      VALUES
        (v_org.org_id, 'MOVIMIENTO_BANCARIO_DEBITO', NULL, true, false,
         'Débito bancario manual — contrapartida seleccionable', 0)
      RETURNING id INTO v_regla_id;
      INSERT INTO accounting.accounting_rule_lines
        (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
      VALUES
        (v_regla_id, NULL, 'DEBE', 'datos.importe', true, v_opciones_gastos),
        (v_regla_id, NULL, 'HABER', 'datos.importe', true, v_opciones_banco);
      v_regla_id := NULL;
    END IF;

    -- MOVIMIENTO_BANCARIO_CREDITO
    IF NOT EXISTS (
      SELECT 1 FROM accounting.accounting_rules
      WHERE org_id = v_org.org_id AND tipo_evento = 'MOVIMIENTO_BANCARIO_CREDITO'
    ) THEN
      INSERT INTO accounting.accounting_rules
        (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
      VALUES
        (v_org.org_id, 'MOVIMIENTO_BANCARIO_CREDITO', NULL, true, false,
         'Crédito bancario manual — contrapartida seleccionable', 0)
      RETURNING id INTO v_regla_id;
      INSERT INTO accounting.accounting_rule_lines
        (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
      VALUES
        (v_regla_id, NULL, 'DEBE', 'datos.importe', true, v_opciones_banco),
        (v_regla_id, NULL, 'HABER', 'datos.importe', true, v_opciones_gastos);
      v_regla_id := NULL;
    END IF;

    -- CHEQUE_RECIBIDO_RECHAZADO
    IF NOT EXISTS (
      SELECT 1 FROM accounting.accounting_rules
      WHERE org_id = v_org.org_id AND tipo_evento = 'CHEQUE_RECIBIDO_RECHAZADO'
    ) THEN
      INSERT INTO accounting.accounting_rules
        (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
      VALUES
        (v_org.org_id, 'CHEQUE_RECIBIDO_RECHAZADO', NULL, true, false,
         'Cheque recibido rechazado — banco acreditado, cheques rechazados debitados', 0)
      RETURNING id INTO v_regla_id;
      INSERT INTO accounting.accounting_rule_lines
        (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
      VALUES
        (v_regla_id, NULL, 'DEBE', 'datos.importe', true, v_opciones_gastos),
        (v_regla_id, NULL, 'HABER', 'datos.importe', true, v_opciones_banco);
      v_regla_id := NULL;
    END IF;

    -- CHEQUE_PROPIO_RECHAZADO
    IF NOT EXISTS (
      SELECT 1 FROM accounting.accounting_rules
      WHERE org_id = v_org.org_id AND tipo_evento = 'CHEQUE_PROPIO_RECHAZADO'
    ) THEN
      INSERT INTO accounting.accounting_rules
        (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
      VALUES
        (v_org.org_id, 'CHEQUE_PROPIO_RECHAZADO', NULL, true, false,
         'Cheque propio rechazado — banco debitado, contrapartida acreditada', 0)
      RETURNING id INTO v_regla_id;
      INSERT INTO accounting.accounting_rule_lines
        (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
      VALUES
        (v_regla_id, NULL, 'DEBE', 'datos.importe', true, v_opciones_banco),
        (v_regla_id, NULL, 'HABER', 'datos.importe', true, v_opciones_gastos);
      v_regla_id := NULL;
    END IF;

    -- DEPOSITO_CHEQUES
    IF NOT EXISTS (
      SELECT 1 FROM accounting.accounting_rules
      WHERE org_id = v_org.org_id AND tipo_evento = 'DEPOSITO_CHEQUES'
    ) THEN
      INSERT INTO accounting.accounting_rules
        (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
      VALUES
        (v_org.org_id, 'DEPOSITO_CHEQUES', NULL, true, false,
         'Boleta depósito de cheques — banco debitado, valores a depositar acreditados', 0)
      RETURNING id INTO v_regla_id;
      INSERT INTO accounting.accounting_rule_lines
        (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
      VALUES
        (v_regla_id, NULL,                 'DEBE',  'datos.importeTotal', true,  v_opciones_banco),
        (v_regla_id, 'VALORES_A_DEPOSITAR','HABER', 'datos.importeTotal', false, NULL);
      v_regla_id := NULL;
    END IF;

    -- DEPOSITO_EFECTIVO
    IF NOT EXISTS (
      SELECT 1 FROM accounting.accounting_rules
      WHERE org_id = v_org.org_id AND tipo_evento = 'DEPOSITO_EFECTIVO'
    ) THEN
      INSERT INTO accounting.accounting_rules
        (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
      VALUES
        (v_org.org_id, 'DEPOSITO_EFECTIVO', NULL, true, false,
         'Boleta depósito de efectivo — banco debitado, caja acreditada', 0)
      RETURNING id INTO v_regla_id;
      INSERT INTO accounting.accounting_rule_lines
        (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
      VALUES
        (v_regla_id, NULL, 'DEBE',  'datos.importe', true, v_opciones_banco),
        (v_regla_id, NULL, 'HABER', 'datos.importe', true, v_opciones_caja_y_banco);
      v_regla_id := NULL;
    END IF;

    -- DEBITO_CHEQUE_PROPIO
    IF NOT EXISTS (
      SELECT 1 FROM accounting.accounting_rules
      WHERE org_id = v_org.org_id AND tipo_evento = 'DEBITO_CHEQUE_PROPIO'
    ) THEN
      INSERT INTO accounting.accounting_rules
        (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
      VALUES
        (v_org.org_id, 'DEBITO_CHEQUE_PROPIO', NULL, true, false,
         'Débito de cheque propio — valores a pagar debitados, banco acreditado', 0)
      RETURNING id INTO v_regla_id;
      INSERT INTO accounting.accounting_rule_lines
        (rule_id, account_code,    lado,   formula,        es_seleccionable, opciones_cuenta)
      VALUES
        (v_regla_id, 'VALORES_A_PAGAR', 'DEBE',  'datos.importe', false, NULL),
        (v_regla_id, NULL,              'HABER', 'datos.importe', true,  v_opciones_banco);
      v_regla_id := NULL;
    END IF;

  END LOOP;

END $$;
