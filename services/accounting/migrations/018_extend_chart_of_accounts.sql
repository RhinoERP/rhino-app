-- ============================================================
-- 018_extend_chart_of_accounts.sql
--
-- Objetivo:
--   1. Corregir el bug de 014: GASTOS_BANCARIOS fue insertado con
--      codigo '4.1.05' (conflicto con VENTAS_PROTECCION). Forzar a '5.7.01'.
--   2. Agregar el plan de cuentas completo que fue cargado manualmente
--      en producción pero nunca capturado en migraciones:
--      PN (3.x), ingresos extendidos (4.1.08+, 4.2.x), compras/CMV (5.2-5.3),
--      gastos explotación/administ./comercializ./financiación/impositivos (5.4-5.8),
--      cuentas puente (9.1.x).
-- ============================================================

SET search_path TO accounting, public;

DO $$
DECLARE
  v_org RECORD;
BEGIN
  FOR v_org IN
    SELECT DISTINCT org_id FROM accounting.chart_of_accounts
  LOOP

    -- ── Fix 014 bug: GASTOS_BANCARIOS insertado con codigo incorrecto ──
    -- Si 014 logró insertar con codigo '4.1.05' (improbable por constraint,
    -- pero posible en entornos sin VENTAS_PROTECCION previa), corregir.
    UPDATE accounting.chart_of_accounts
    SET codigo = '5.7.01'
    WHERE org_id = v_org.org_id
      AND account_code = 'GASTOS_BANCARIOS'
      AND codigo <> '5.7.01';

    -- ── Insertar cuentas faltantes (idempotente por account_code) ──────

    INSERT INTO accounting.chart_of_accounts
      (org_id, codigo, nombre, account_code, tipo, naturaleza, permite_movimientos, activa)
    VALUES
      -- PASIVO extra
      (v_org.org_id, '2.1.90', 'Pasivo No Corriente',                      'PASIVO_NO_CORRIENTE',                      'PASIVO',  'ACREEDORA', false, true),

      -- PATRIMONIO NETO
      (v_org.org_id, '3.1.00', 'Aporte de Capital',                        'APORTE_DE_CAPITAL',                        'PN',      'ACREEDORA', false, true),
      (v_org.org_id, '3.1.01', 'Capital Social',                           'CAPITAL_SOCIAL',                           'PN',      'ACREEDORA', true,  true),
      (v_org.org_id, '3.1.02', 'Aportes Socios',                           'APORTES_SOCIOS',                           'PN',      'ACREEDORA', true,  true),
      (v_org.org_id, '3.1.03', 'Ajuste al Capital',                        'AJUSTE_AL_CAPITAL',                        'PN',      'ACREEDORA', true,  true),
      (v_org.org_id, '3.1.04', 'Reexpresión Monetaria AP.IRR.',            'REEXPRESION_MONETARIA_AP_IRR',             'PN',      'ACREEDORA', true,  true),
      (v_org.org_id, '3.2.00', 'Ganancias Reservadas',                     'GANANCIAS_RESERVADAS',                     'PN',      'ACREEDORA', false, true),
      (v_org.org_id, '3.2.01', 'Reserva Legal',                            'RESERVA_LEGAL',                            'PN',      'ACREEDORA', true,  true),
      (v_org.org_id, '3.2.02', 'Reserva Facultativa',                      'RESERVA_FACULTATIVA',                      'PN',      'ACREEDORA', true,  true),
      (v_org.org_id, '3.2.03', 'Reexpresión Monetaria Reserva Legal',      'REEXPRESION_MONETARIA_RVA_LEGAL',          'PN',      'ACREEDORA', true,  true),
      (v_org.org_id, '3.2.04', 'Reexpresión Monetaria Reserva Facultativa','REEXPRESION_MONETARIA_RVA_FAC',            'PN',      'ACREEDORA', true,  true),
      (v_org.org_id, '3.3.00', 'Resultados',                               'RESULTADOS',                               'PN',      'ACREEDORA', false, true),
      (v_org.org_id, '3.3.01', 'Resultado del Ejercicio',                  'RESULTADO_DEL_EJERCICIO',                  'PN',      'ACREEDORA', true,  true),
      (v_org.org_id, '3.3.02', 'Resultados No Asignados',                  'RESULTADOS_NO_ASIGNADOS',                  'PN',      'ACREEDORA', true,  true),
      (v_org.org_id, '3.3.03', 'Reexpresión Monetaria Resultado No Asignado','REEXPRESION_MONETARIA_RDO_NO_ASIG',      'PN',      'ACREEDORA', true,  true),

      -- INGRESOS extendidos
      (v_org.org_id, '4.1.08', 'Resultados Extraordinarios',               'RESULTADOS_EXTRAORDINARIOS',               'INGRESO', 'ACREEDORA', true,  true),
      (v_org.org_id, '4.1.09', 'Venta Artículos Ferretería',               'VENTA_ARTICULOS_FERRETERIA',               'INGRESO', 'ACREEDORA', true,  true),
      (v_org.org_id, '4.2.00', 'Ingresos por Inversiones',                 'INGRESOS_POR_INVERSIONES',                 'INGRESO', 'ACREEDORA', false, true),
      (v_org.org_id, '4.2.01', 'Resultado Positivo por Inversiones Permanentes','RESULTADO_POSITIVO_INVERSIONES_PERMANENTES','INGRESO','ACREEDORA',true,true),

      -- COMPRAS
      (v_org.org_id, '5.2.01', 'Compras de Mercadería',                    'COMPRAS_MERCADERIA',                       'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.2.02', 'Gastos de Flete',                          'GASTOS_FLETE',                             'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.2.03', 'Gastos Generales',                         'GASTOS_GENERALES',                         'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.2.04', 'Servicios y Honorarios',                   'SERVICIOS_HONORARIOS',                     'EGRESO',  'DEUDORA',   true,  true),

      -- COSTO DE MERCADERÍA VENDIDA
      (v_org.org_id, '5.3.00', 'Costo de Mercadería Vendida',              'COSTO_MERCADERIA_VENDIDA',                 'EGRESO',  'DEUDORA',   false, true),
      (v_org.org_id, '5.3.01', 'Costo de Venta Indumentaria',              'COSTO_VENTA_INDUMENTARIA',                 'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.3.02', 'Costo de Venta Calzado',                   'COSTO_VENTA_CALZADO',                      'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.3.03', 'Costo de Venta Merchandising',             'COSTO_VENTA_MERCHANDISING',                'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.3.04', 'Costo de Venta Prevención',                'COSTO_VENTA_PREVENCION',                   'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.3.05', 'Costo de Venta Protección',                'COSTO_VENTA_PROTECCION',                   'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.3.06', 'Costo de Venta Seguridad',                 'COSTO_VENTA_SEGURIDAD',                    'EGRESO',  'DEUDORA',   true,  true),

      -- GASTOS DE EXPLOTACIÓN
      (v_org.org_id, '5.4.00', 'Gastos de Explotación',                    'GASTOS_EXPLOTACION',                       'EGRESO',  'DEUDORA',   false, true),
      (v_org.org_id, '5.4.01', 'Sueldos',                                  'SUELDOS',                                  'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.02', 'Indemnizaciones',                          'INDEMNIZACIONES',                          'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.03', 'Fletes y Logística',                       'FLETES_LOGISTICA',                         'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.04', 'Packaging',                                'PACKAGING',                                'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.05', 'Combustible',                              'COMBUSTIBLE',                              'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.06', 'Viáticos',                                 'VIATICOS',                                 'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.07', 'Amortizaciones Bienes de Uso',             'AMORTIZACIONES_BIENES_USO',                'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.08', 'Gastos Seguridad',                         'GASTOS_SEGURIDAD',                         'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.09', 'Hoteles y Alojamiento',                    'HOTELES_ALOJAMIENTO',                      'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.10', 'Alquileres',                               'ALQUILERES',                               'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.11', 'Expensas',                                 'EXPENSAS',                                 'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.12', 'Impuesto Inmobiliario',                    'IMPUESTO_INMOBILIARIO',                    'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.13', 'Impuesto Tasas y Contribución',            'IMPUESTO_TASAS_CONTRIBUCION',              'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.14', 'Teléfonos',                                'TELEFONOS',                                'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.15', 'Servicios Públicos',                       'SERVICIOS_PUBLICOS',                       'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.16', 'Tasas Administrativas Municipales',        'TASAS_ADMINISTRATIVAS_MUNICIPALES',        'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.17', 'Seguros',                                  'SEGUROS',                                  'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.18', 'Remodelaciones',                           'REMODELACIONES',                           'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.19', 'Gastos de Personal',                       'GASTOS_PERSONAL',                          'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.20', 'Cargas Sociales',                          'CARGAS_SOCIALES',                          'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.4.21', 'Sindicatos',                               'SINDICATOS',                               'EGRESO',  'DEUDORA',   true,  true),

      -- GASTOS DE ADMINISTRACIÓN
      (v_org.org_id, '5.5.00', 'Gastos de Administración',                 'GASTOS_ADMINISTRACION',                    'EGRESO',  'DEUDORA',   false, true),
      (v_org.org_id, '5.5.01', 'Impresos y Útiles',                        'IMPRESOS_UTILES',                          'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.5.02', 'Informática',                              'INFORMATICA',                              'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.5.03', 'Honorarios',                               'HONORARIOS',                               'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.5.04', 'Honorarios Gerencia',                      'HONORARIOS_GERENCIA',                      'EGRESO',  'DEUDORA',   true,  true),

      -- GASTOS DE COMERCIALIZACIÓN
      (v_org.org_id, '5.6.00', 'Gastos de Comercialización',               'GASTOS_COMERCIALIZACION',                  'EGRESO',  'DEUDORA',   false, true),
      (v_org.org_id, '5.6.01', 'Gastos Varios Comercialización',           'GASTOS_VARIOS_COMERCIALIZACION',           'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.6.02', 'Comisiones por Ventas',                    'COMISIONES_POR_VENTAS',                    'EGRESO',  'DEUDORA',   true,  true),

      -- GASTOS DE FINANCIACIÓN
      (v_org.org_id, '5.7.00', 'Gastos de Financiación',                   'GASTOS_FINANCIACION',                      'EGRESO',  'DEUDORA',   false, true),
      -- 5.7.01 GASTOS_BANCARIOS: insertado manualmente (bug en 014 usó codigo '4.1.05')
      (v_org.org_id, '5.7.01', 'Gastos Bancarios',                         'GASTOS_BANCARIOS',                         'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.7.02', 'Intereses Imponibles y Multas',            'INTERESES_IMPONIBLES_MULTAS',              'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.7.03', 'Impuesto Ley 25413',                       'IMPUESTO_LEY_25413',                       'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.7.04', 'Diferencia de Cambio',                     'DIFERENCIA_CAMBIO',                        'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.7.05', 'R.E.C.P.A.M.',                             'RECPAM',                                   'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.7.06', 'Defecto Provisión',                        'DEFECTO_PROVISION',                        'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.7.07', 'Descuento de Cheques',                     'DESCUENTO_CHEQUES',                        'EGRESO',  'DEUDORA',   true,  true),

      -- GASTOS IMPOSITIVOS
      (v_org.org_id, '5.8.00', 'Gastos Impositivos',                       'GASTOS_IMPOSITIVOS',                       'EGRESO',  'DEUDORA',   false, true),
      (v_org.org_id, '5.8.01', 'Impuesto a las Ganancias',                 'IMPUESTO_GANANCIAS',                       'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.8.02', 'Impuestos Internos',                       'IMPUESTOS_INTERNOS',                       'EGRESO',  'DEUDORA',   true,  true),
      (v_org.org_id, '5.8.03', 'Bienes Personales',                        'BIENES_PERSONALES',                        'EGRESO',  'DEUDORA',   true,  true),

      -- CUENTAS PUENTE / COMPENSACIÓN
      (v_org.org_id, '9.1.00', 'Cuenta Puente',                            'CUENTA_PUENTE',                            'ACTIVO',  'DEUDORA',   false, true),
      (v_org.org_id, '9.1.01', 'Compensaciones Bancarios',                 'COMPENSACIONES_BANCARIOS',                 'ACTIVO',  'DEUDORA',   true,  true),
      (v_org.org_id, '9.1.02', 'Compensación Sociedades',                  'COMPENSACION_SOCIEDADES',                  'ACTIVO',  'DEUDORA',   true,  true),
      (v_org.org_id, '9.1.03', 'Saldos Iniciales',                         'SALDOS_INICIALES',                         'ACTIVO',  'DEUDORA',   true,  true)

    ON CONFLICT (org_id, account_code) DO NOTHING;

  END LOOP;

  RAISE NOTICE 'Migración 018 completada: plan de cuentas extendido aplicado a todas las organizaciones';
END;
$$;
