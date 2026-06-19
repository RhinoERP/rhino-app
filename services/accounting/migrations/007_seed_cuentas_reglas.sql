-- Seed: Plan de cuentas + Reglas contables del contador (preliminar 10/06/2026)
-- Ejecutar en Supabase SQL Editor DESPUÉS de las migraciones 001-006.
--
-- IMPORTANTE: reemplazar el ORG_ID con el UUID real de la organización
-- antes de ejecutar. El mismo ORG_ID debe usarse en el servicio Express.
--
-- Uso: reemplazar el valor de org_id en la primera línea y ejecutar todo.

DO $$
DECLARE
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'; -- ← CAMBIAR POR ORG_ID REAL

  -- IDs de cuentas
  id_ar_deudores          UUID;
  id_iva_credito          UUID;
  id_percepciones_iibb    UUID;
  id_retenciones_iibb     UUID;
  id_caja_pesos           UUID;
  id_banco_bbva           UUID;
  id_banco_supervielle    UUID;
  id_mercado_pago         UUID;
  id_calfpay              UUID;
  id_ap_proveedores       UUID;
  id_anticipo_clientes    UUID;
  id_iva_debito           UUID;
  id_ventas_calzado       UUID;
  id_ventas_indumentaria  UUID;
  id_ventas_merchandising UUID;
  id_ventas_prevencion    UUID;
  id_ventas_proteccion    UUID;
  id_ventas_seguridad     UUID;
  id_otros_ingresos       UUID;
  id_descuentos           UUID;
  id_intereses            UUID;
  id_iibb_gasto           UUID;

  -- IDs de reglas
  id_rule_fv_manual    UUID;
  id_rule_fv_remito    UUID;
  id_rule_fv_anticipo  UUID;
  id_rule_nc_manual    UUID;
  id_rule_nc_remito    UUID;
  id_rule_nc_anticipo  UUID;
  id_rule_fc           UUID;
  id_rule_nc_compra    UUID;
  id_rule_cobro        UUID;
  id_rule_orden_pago   UUID;

  v_opciones_banco JSONB := '[
    {"accountCode": "CAJA_PESOS",              "label": "Caja Pesos"},
    {"accountCode": "BANCO_BBVA_PESOS",        "label": "Banco BBVA"},
    {"accountCode": "BANCO_SUPERVIELLE_PESOS", "label": "Banco Supervielle"},
    {"accountCode": "MERCADO_PAGO",            "label": "Mercado Pago"},
    {"accountCode": "CALFPAY",                 "label": "Calfpay"}
  ]'::JSONB;

BEGIN

  -- ==============================================================
  -- 1. PLAN DE CUENTAS
  -- ==============================================================

  INSERT INTO accounting.chart_of_accounts
    (org_id, codigo, nombre, account_code, tipo, naturaleza, permite_movimientos)
  VALUES
    -- ACTIVO
    (v_org_id, '1.1.01', 'Deudores por Ventas',     'AR_DEUDORES_VENTAS',       'ACTIVO',  'DEUDORA',   true),
    (v_org_id, '1.1.02', 'IVA Crédito Fiscal',       'IVA_CREDITO_FISCAL',       'ACTIVO',  'DEUDORA',   true),
    (v_org_id, '1.1.03', 'Percepciones IIBB',        'PERCEPCIONES_IIBB',        'ACTIVO',  'DEUDORA',   true),
    (v_org_id, '1.1.04', 'Retenciones IIBB',         'RETENCIONES_IIBB',         'ACTIVO',  'DEUDORA',   true),
    (v_org_id, '1.1.10', 'Caja Pesos',               'CAJA_PESOS',               'ACTIVO',  'DEUDORA',   true),
    (v_org_id, '1.1.11', 'Banco BBVA Francés',       'BANCO_BBVA_PESOS',         'ACTIVO',  'DEUDORA',   true),
    (v_org_id, '1.1.12', 'Banco Supervielle Pesos',  'BANCO_SUPERVIELLE_PESOS',  'ACTIVO',  'DEUDORA',   true),
    (v_org_id, '1.1.13', 'Mercado Pago',             'MERCADO_PAGO',             'ACTIVO',  'DEUDORA',   true),
    (v_org_id, '1.1.14', 'Calfpay',                  'CALFPAY',                  'ACTIVO',  'DEUDORA',   true),
    -- PASIVO
    (v_org_id, '2.1.01', 'Proveedores a Pagar',      'AP_PROVEEDORES',           'PASIVO',  'ACREEDORA', true),
    (v_org_id, '2.1.02', 'Anticipo de Clientes',     'ANTICIPO_CLIENTES',        'PASIVO',  'ACREEDORA', true),
    (v_org_id, '2.1.03', 'Débito Fiscal (IVA)',      'IVA_DEBITO_FISCAL',        'PASIVO',  'ACREEDORA', true),
    -- INGRESO
    (v_org_id, '4.1.01', 'Ventas Calzado',           'VENTAS_CALZADO',           'INGRESO', 'ACREEDORA', true),
    (v_org_id, '4.1.02', 'Ventas Indumentaria',      'VENTAS_INDUMENTARIA',      'INGRESO', 'ACREEDORA', true),
    (v_org_id, '4.1.03', 'Ventas Merchandising',     'VENTAS_MERCHANDISING',     'INGRESO', 'ACREEDORA', true),
    (v_org_id, '4.1.04', 'Ventas Prevención',        'VENTAS_PREVENCION',        'INGRESO', 'ACREEDORA', true),
    (v_org_id, '4.1.05', 'Ventas Protección',        'VENTAS_PROTECCION',        'INGRESO', 'ACREEDORA', true),
    (v_org_id, '4.1.06', 'Ventas Seguridad',         'VENTAS_SEGURIDAD',         'INGRESO', 'ACREEDORA', true),
    (v_org_id, '4.1.07', 'Otros Ingresos',           'OTROS_INGRESOS',           'INGRESO', 'ACREEDORA', true),
    -- EGRESO
    (v_org_id, '5.1.01', 'Descuentos Otorgados',     'DESCUENTOS_OTORGADOS',     'EGRESO',  'DEUDORA',   true),
    (v_org_id, '5.1.02', 'Intereses Financieros',    'INTERESES_FINANCIEROS',    'EGRESO',  'DEUDORA',   true),
    (v_org_id, '5.1.03', 'Ingresos Brutos (gasto)',  'IIBB_GASTO',               'EGRESO',  'DEUDORA',   true)
  ON CONFLICT (org_id, codigo) DO NOTHING;

  -- ==============================================================
  -- 2. REGLAS CONTABLES
  -- ==============================================================

  -- FACTURA_VENTA — condición MANUAL
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  VALUES
    (v_org_id, 'FACTURA_VENTA', '{"tipoFactura":"MANUAL"}'::JSONB, true, true,
     'Factura de venta manual — DEBE por líneas desglosadas, HABER deudores', 10)
  RETURNING id INTO id_rule_fv_manual;

  -- FACTURA_VENTA — condición REMITO (misma estructura que MANUAL)
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  VALUES
    (v_org_id, 'FACTURA_VENTA', '{"tipoFactura":"REMITO"}'::JSONB, true, true,
     'Factura de venta contra remito — DEBE por líneas desglosadas, HABER deudores', 10)
  RETURNING id INTO id_rule_fv_remito;

  -- FACTURA_VENTA — condición ANTICIPO
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  VALUES
    (v_org_id, 'FACTURA_VENTA', '{"tipoFactura":"ANTICIPO"}'::JSONB, true, true,
     'Factura de venta anticipo — DEBE anticipo clientes + IVA, HABER deudores', 20)
  RETURNING id INTO id_rule_fv_anticipo;

  -- NC_VENTA — condición MANUAL
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  VALUES
    (v_org_id, 'NC_VENTA', '{"tipoFactura":"MANUAL"}'::JSONB, true, true,
     'NC de venta manual — DEBE deudores, HABER líneas desglosadas', 10)
  RETURNING id INTO id_rule_nc_manual;

  -- NC_VENTA — condición REMITO
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  VALUES
    (v_org_id, 'NC_VENTA', '{"tipoFactura":"REMITO"}'::JSONB, true, true,
     'NC de venta contra remito — DEBE deudores, HABER líneas desglosadas', 10)
  RETURNING id INTO id_rule_nc_remito;

  -- NC_VENTA — condición ANTICIPO
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  VALUES
    (v_org_id, 'NC_VENTA', '{"tipoFactura":"ANTICIPO"}'::JSONB, true, true,
     'NC de venta anticipo — DEBE deudores, HABER anticipo clientes + IVA', 20)
  RETURNING id INTO id_rule_nc_anticipo;

  -- FACTURA_COMPRA — catch-all
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  VALUES
    (v_org_id, 'FACTURA_COMPRA', NULL, true, true,
     'Factura de compra — DEBE IVA + gasto (seleccionable), HABER proveedores', 0)
  RETURNING id INTO id_rule_fc;

  -- NC_COMPRA — catch-all
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  VALUES
    (v_org_id, 'NC_COMPRA', NULL, true, true,
     'NC de compra — DEBE proveedores, HABER IVA + gasto (seleccionable)', 0)
  RETURNING id INTO id_rule_nc_compra;

  -- COBRO — catch-all
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  VALUES
    (v_org_id, 'COBRO', NULL, true, true,
     'Cobro de factura — DEBE banco (seleccionable), HABER deudores', 0)
  RETURNING id INTO id_rule_cobro;

  -- ORDEN_PAGO — catch-all
  INSERT INTO accounting.accounting_rules
    (org_id, tipo_evento, condicion, activa, es_fija, descripcion, prioridad)
  VALUES
    (v_org_id, 'ORDEN_PAGO', NULL, true, true,
     'Orden de pago a proveedor — DEBE proveedores, HABER banco (seleccionable)', 0)
  RETURNING id INTO id_rule_orden_pago;

  -- ==============================================================
  -- 3. LÍNEAS DE REGLAS
  -- ==============================================================

  -- FACTURA_VENTA MANUAL: HABER deudores (totalFactura) + DEBE expand lineas
  INSERT INTO accounting.accounting_rule_lines
    (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
  VALUES
    (id_rule_fv_manual, NULL,                  'DEBE',  'EXPAND:datos.lineasDesglosadas', false, NULL),
    (id_rule_fv_manual, 'AR_DEUDORES_VENTAS',  'HABER', 'datos.totalFactura',             false, NULL);

  -- FACTURA_VENTA REMITO: idéntico a MANUAL
  INSERT INTO accounting.accounting_rule_lines
    (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
  VALUES
    (id_rule_fv_remito, NULL,                  'DEBE',  'EXPAND:datos.lineasDesglosadas', false, NULL),
    (id_rule_fv_remito, 'AR_DEUDORES_VENTAS',  'HABER', 'datos.totalFactura',             false, NULL);

  -- FACTURA_VENTA ANTICIPO
  INSERT INTO accounting.accounting_rule_lines
    (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
  VALUES
    (id_rule_fv_anticipo, 'ANTICIPO_CLIENTES',  'DEBE',  'datos.montoNeto',       false, NULL),
    (id_rule_fv_anticipo, 'IVA_DEBITO_FISCAL',  'DEBE',  'datos.montoImpuestos',  false, NULL),
    (id_rule_fv_anticipo, 'AR_DEUDORES_VENTAS', 'HABER', 'datos.totalFactura',    false, NULL);

  -- NC_VENTA MANUAL: DEBE deudores + HABER expand lineas
  INSERT INTO accounting.accounting_rule_lines
    (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
  VALUES
    (id_rule_nc_manual, 'AR_DEUDORES_VENTAS', 'DEBE',  'datos.totalFactura',             false, NULL),
    (id_rule_nc_manual, NULL,                 'HABER', 'EXPAND:datos.lineasDesglosadas', false, NULL);

  -- NC_VENTA REMITO: idéntico a NC_MANUAL
  INSERT INTO accounting.accounting_rule_lines
    (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
  VALUES
    (id_rule_nc_remito, 'AR_DEUDORES_VENTAS', 'DEBE',  'datos.totalFactura',             false, NULL),
    (id_rule_nc_remito, NULL,                 'HABER', 'EXPAND:datos.lineasDesglosadas', false, NULL);

  -- NC_VENTA ANTICIPO
  INSERT INTO accounting.accounting_rule_lines
    (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
  VALUES
    (id_rule_nc_anticipo, 'AR_DEUDORES_VENTAS', 'DEBE',  'datos.totalFactura',     false, NULL),
    (id_rule_nc_anticipo, 'ANTICIPO_CLIENTES',  'HABER', 'datos.montoNeto',        false, NULL),
    (id_rule_nc_anticipo, 'IVA_DEBITO_FISCAL',  'HABER', 'datos.montoImpuestos',   false, NULL);

  -- FACTURA_COMPRA
  INSERT INTO accounting.accounting_rule_lines
    (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
  VALUES
    (id_rule_fc, 'IVA_CREDITO_FISCAL', 'DEBE',  'datos.montoImpuestos', false, NULL),
    (id_rule_fc, 'PERCEPCIONES_IIBB',  'DEBE',  'datos.montoIIBB',      false, NULL), -- omitida si = 0
    (id_rule_fc, NULL,                 'DEBE',  'datos.montoNeto',       true,  NULL), -- seleccionable
    (id_rule_fc, 'AP_PROVEEDORES',     'HABER', 'datos.totalFactura',    false, NULL);

  -- NC_COMPRA (inverso de FACTURA_COMPRA)
  INSERT INTO accounting.accounting_rule_lines
    (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
  VALUES
    (id_rule_nc_compra, 'AP_PROVEEDORES',     'DEBE',  'datos.totalFactura',    false, NULL),
    (id_rule_nc_compra, 'IVA_CREDITO_FISCAL', 'HABER', 'datos.montoImpuestos',  false, NULL),
    (id_rule_nc_compra, NULL,                 'HABER', 'datos.montoNeto',        true,  NULL); -- seleccionable

  -- COBRO
  INSERT INTO accounting.accounting_rule_lines
    (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
  VALUES
    (id_rule_cobro, NULL,                  'DEBE',  'datos.montoCobrado', true,  v_opciones_banco),
    (id_rule_cobro, 'AR_DEUDORES_VENTAS',  'HABER', 'datos.montoCobrado', false, NULL);

  -- ORDEN_PAGO
  INSERT INTO accounting.accounting_rule_lines
    (rule_id, account_code, lado, formula, es_seleccionable, opciones_cuenta)
  VALUES
    (id_rule_orden_pago, 'AP_PROVEEDORES', 'DEBE',  'datos.monto', false, NULL),
    (id_rule_orden_pago, NULL,             'HABER', 'datos.monto', true,  v_opciones_banco);

  RAISE NOTICE 'Seed completado para org_id: %', v_org_id;

END;
$$;
