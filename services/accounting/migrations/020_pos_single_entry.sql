-- 020_pos_single_entry.sql
-- POS uses one accounting entry: DEBE cash/bank, HABER sales and taxes.
-- Existing COBRO_POS rules and historical entries remain available for legacy data.

SET search_path TO accounting, public;

UPDATE accounting.accounting_rule_lines AS line
SET
  account_code = NULL,
  es_seleccionable = true,
  opciones_cuenta = NULL
FROM accounting.accounting_rules AS rule
WHERE line.rule_id = rule.id
  AND rule.tipo_evento = 'VENTA_POS'
  AND line.lado = 'DEBE'
  AND line.formula = 'datos.totalVenta';

UPDATE accounting.accounting_rules
SET descripcion =
  'Venta directa POS — DEBE caja/banco (seleccionable), HABER ventas+IVA por líneas desglosadas'
WHERE tipo_evento = 'VENTA_POS';
