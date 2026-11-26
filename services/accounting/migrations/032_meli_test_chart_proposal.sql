-- Install an explicitly invoked seed for a TEST organization. This migration
-- does not alter any chart, enable a feature flag, or publish journal entries.
BEGIN;

CREATE FUNCTION accounting.seed_meli_test_chart(
  p_org_id uuid,
  p_enable_usd_for_existing boolean
) RETURNS TABLE (
  account_code text,
  account_id uuid,
  account_number text,
  currency text,
  result text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item record;
  v_existing record;
  v_result text;
BEGIN
  IF p_org_id IS NULL OR p_enable_usd_for_existing IS NULL THEN
    RAISE EXCEPTION 'Indicá la organización de prueba y la opción USD'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts a WHERE a.org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'La organización indicada no tiene un plan de cuentas existente';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('meli-chart-proposal:' || p_org_id::text, 0)
  );
  FOR v_item IN
    SELECT * FROM (VALUES
      ('1.1.01', 'Deudores por Ventas', 'AR_DEUDORES_VENTAS', 'ACTIVO', 'DEUDORA'),
      ('1.1.13', 'Mercado Pago', 'MERCADO_PAGO', 'ACTIVO', 'DEUDORA'),
      ('2.1.03', 'Debito Fiscal (IVA)', 'IVA_DEBITO_FISCAL', 'PASIVO', 'ACREEDORA'),
      ('4.1.10', 'Ventas Mercado Libre', 'VENTAS_MERCADO_LIBRE', 'INGRESO', 'ACREEDORA'),
      ('2.1.04', 'Tributos a Pagar', 'TRIBUTOS_A_PAGAR', 'PASIVO', 'ACREEDORA'),
      ('5.1.01', 'Descuentos Otorgados', 'DESCUENTOS_OTORGADOS', 'EGRESO', 'DEUDORA'),
      ('5.6.02', 'Comisiones por Ventas', 'COMISIONES_POR_VENTAS', 'EGRESO', 'DEUDORA'),
      ('5.4.06', 'Viaticos', 'VIATICOS', 'EGRESO', 'DEUDORA')
    ) AS proposed(codigo, nombre, account_code, tipo, naturaleza)
  LOOP
    IF (SELECT count(*) FROM accounting.chart_of_accounts a
      WHERE a.org_id = p_org_id AND a.account_code = v_item.account_code) > 1 THEN
      RAISE EXCEPTION 'La cuenta semántica % está duplicada; revisar manualmente',
        v_item.account_code;
    END IF;
    SELECT a.id, a.codigo, a.tipo, a.naturaleza, a.moneda, a.activa, a.permite_movimientos
      INTO v_existing FROM accounting.chart_of_accounts a
      WHERE a.org_id = p_org_id AND a.account_code = v_item.account_code
      FOR UPDATE;
    IF FOUND THEN
      IF v_existing.tipo IS DISTINCT FROM v_item.tipo
        OR v_existing.naturaleza IS DISTINCT FROM v_item.naturaleza
        OR v_existing.moneda IS NULL OR v_existing.moneda NOT IN ('ARS', 'AMBAS')
        OR v_existing.activa IS DISTINCT FROM true
        OR v_existing.permite_movimientos IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'La cuenta % existente es incompatible; revisar manualmente',
          v_item.account_code;
      END IF;
      v_result := 'EXISTING';
      IF v_existing.moneda = 'ARS' AND p_enable_usd_for_existing THEN
        UPDATE accounting.chart_of_accounts a SET moneda = 'AMBAS'
          WHERE a.id = v_existing.id AND a.org_id = p_org_id;
        v_existing.moneda := 'AMBAS';
        v_result := 'USD_ENABLED';
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM accounting.chart_of_accounts a
        WHERE a.org_id = p_org_id AND a.codigo = v_item.codigo) THEN
        RAISE EXCEPTION 'El código % propuesto para % ya está ocupado; revisar manualmente',
          v_item.codigo, v_item.account_code;
      END IF;
      INSERT INTO accounting.chart_of_accounts AS a (
        org_id, codigo, nombre, account_code, tipo, naturaleza, moneda,
        activa, permite_movimientos
      ) VALUES (
        p_org_id, v_item.codigo, v_item.nombre, v_item.account_code,
        v_item.tipo, v_item.naturaleza, 'AMBAS', true, true
      ) RETURNING a.id, a.codigo, a.tipo, a.naturaleza, a.moneda,
        a.activa, a.permite_movimientos INTO v_existing;
      v_result := 'CREATED';
    END IF;
    RETURN QUERY SELECT v_item.account_code::text, v_existing.id,
      v_existing.codigo::text, v_existing.moneda::text, v_result;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION accounting.seed_meli_test_chart(uuid, boolean) FROM PUBLIC;
COMMIT;
