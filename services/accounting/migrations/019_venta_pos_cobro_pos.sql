-- ============================================================
-- 019_venta_pos_cobro_pos.sql
--
-- Objetivo:
--   1. Habilitar los source_type VENTA_POS y COBRO_POS para asientos
--      informales (venta directa POS siempre nace informal; se asienta
--      directo si es TICKET_X, o se formaliza junto al cobro cuando ARCA
--      autoriza una Factura B/C).
--   2. Agregar reglas contables VENTA_POS y COBRO_POS a cada organización
--      que ya tenga plan de cuentas configurado. No crea cuentas nuevas ni
--      asume bancos/billeteras específicos: la cuenta de cobro se resuelve
--      contra el plan de cuentas propio de cada organización (sin lista de
--      opciones fija), igual que FACTURA_COMPRA/NC_COMPRA.
--
-- Orientación (a diferencia de FACTURA_VENTA/COBRO, que dejan DEBE por
-- líneas desglosadas y HABER deudores): aquí se usa el criterio contable
-- convencional para que Deudores quede compensado en 0 entre ambos
-- asientos de la misma venta POS.
--   VENTA_POS: DEBE Deudores (fijo) | HABER ventas+IVA (EXPAND)
--   COBRO_POS: DEBE caja/banco (seleccionable, sin restricción) | HABER Deudores (fijo)
-- ============================================================

SET search_path TO accounting, public;

-- ── Paso 1: habilitar VENTA_POS / COBRO_POS como source_type informal ───────
ALTER TABLE accounting.informal_entries
  DROP CONSTRAINT IF EXISTS informal_entries_source_type_check;

ALTER TABLE accounting.informal_entries
  ADD CONSTRAINT informal_entries_source_type_check
  CHECK (
    source_type IN (
      'NOTA_DE_VENTA',
      'FACTURA_PENDIENTE',
      'COMPRA',
      'NOTA_DE_CREDITO',
      'COBRO',
      'ORDEN_PAGO',
      'VENTA_POS',
      'COBRO_POS'
    )
  );

-- ── Paso 2: reglas VENTA_POS / COBRO_POS por organización ───────────────────
DO $$
DECLARE
  v_org       RECORD;
  v_regla_id  UUID;
BEGIN
  FOR v_org IN
    SELECT DISTINCT org_id FROM accounting.chart_of_accounts
  LOOP

    -- VENTA_POS — catch-all
    IF NOT EXISTS (
      SELECT 1 FROM accounting.accounting_rules
      WHERE org_id = v_org.org_id AND tipo_evento = 'VENTA_POS'
    ) THEN
      INSERT INTO accounting.accounting_rules
        (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
      VALUES
        (v_org.org_id, 'VENTA_POS', NULL, true, true,
         'Venta directa POS — DEBE deudores (fijo), HABER ventas+IVA por líneas desglosadas', 0)
      RETURNING id INTO v_regla_id;

      INSERT INTO accounting.accounting_rule_lines
        (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
      VALUES
        (v_regla_id, 'AR_DEUDORES_VENTAS', 'DEBE',  'datos.totalVenta',              false, NULL),
        (v_regla_id, NULL,                 'HABER', 'EXPAND:datos.lineasDesglosadas', false, NULL);
      v_regla_id := NULL;
    END IF;

    -- COBRO_POS — catch-all. La línea DEBE es seleccionable sin lista de
    -- opciones fija: cada organización elige entre las cuentas de SU propio
    -- plan de cuentas (caja, bancos, billeteras que tenga configuradas).
    IF NOT EXISTS (
      SELECT 1 FROM accounting.accounting_rules
      WHERE org_id = v_org.org_id AND tipo_evento = 'COBRO_POS'
    ) THEN
      INSERT INTO accounting.accounting_rules
        (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
      VALUES
        (v_org.org_id, 'COBRO_POS', NULL, true, true,
         'Cobro de venta directa POS — DEBE caja/banco (seleccionable), HABER deudores (fijo)', 0)
      RETURNING id INTO v_regla_id;

      INSERT INTO accounting.accounting_rule_lines
        (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
      VALUES
        (v_regla_id, NULL,                  'DEBE',  'datos.montoCobrado', true,  NULL),
        (v_regla_id, 'AR_DEUDORES_VENTAS',  'HABER', 'datos.montoCobrado', false, NULL);
      v_regla_id := NULL;
    END IF;

  END LOOP;
END $$;
