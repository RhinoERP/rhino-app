-- Notas de débito de venta: cuentas y reglas para organizaciones existentes.
SET search_path TO accounting, public;

-- Los códigos semánticos deben poder repetirse por organización.
ALTER TABLE accounting.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_account_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_org_account_code_key
  ON accounting.chart_of_accounts (org_id, account_code)
  WHERE account_code IS NOT NULL;

-- Cuenta pasiva para tributos ARCA no IVA.
INSERT INTO accounting.chart_of_accounts
  (org_id, codigo, nombre, account_code, tipo, naturaleza, permite_movimientos)
SELECT
  accounts.org_id,
  '2.1.04',
  'Tributos a Pagar',
  'TRIBUTOS_A_PAGAR',
  'PASIVO',
  'ACREEDORA',
  true
FROM (
  SELECT DISTINCT org_id
  FROM accounting.chart_of_accounts
  WHERE account_code = 'AR_DEUDORES_VENTAS'
) AS accounts
ON CONFLICT (org_id, codigo) DO UPDATE
  SET account_code = EXCLUDED.account_code,
      nombre = EXCLUDED.nombre,
      tipo = EXCLUDED.tipo,
      naturaleza = EXCLUDED.naturaleza,
      permite_movimientos = EXCLUDED.permite_movimientos;

WITH inserted_rules AS (
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  SELECT
    accounts.org_id,
    'ND_VENTA',
    NULL,
    true,
    true,
    'ND de venta — DEBE deudores, HABER ingreso e impuestos',
    0
  FROM (
    SELECT DISTINCT org_id
    FROM accounting.chart_of_accounts
    WHERE account_code = 'AR_DEUDORES_VENTAS'
  ) AS accounts
  WHERE NOT EXISTS (
    SELECT 1
    FROM accounting.accounting_rules rule
    WHERE rule.org_id = accounts.org_id
      AND rule.tipo_evento = 'ND_VENTA'
  )
  RETURNING id
)
INSERT INTO accounting.accounting_rule_lines
  (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
SELECT id, 'AR_DEUDORES_VENTAS', 'DEBE', 'datos.totalFactura', false, NULL::jsonb
FROM inserted_rules
UNION ALL
SELECT id, NULL, 'HABER', 'EXPAND:datos.lineasDesglosadas', false, NULL::jsonb
FROM inserted_rules;
