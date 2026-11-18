-- Audited against the definitions supplied from the development database.
-- Dashboard access never follows implicitly from a Mercado Libre permission.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_cash_flow_projection(
  p_org_id uuid, p_weeks_lookahead integer DEFAULT 5,
  p_customer_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_result json;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Organización inválida'; END IF;
  IF NOT (coalesce(auth.role(), '') = 'service_role'
    OR coalesce(public.user_has_org_permission(p_org_id, 'organization.admin'), false)
    OR coalesce(public.user_has_org_permission(p_org_id, 'dashboard.read'), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para consultar Torre de Control';
  END IF;
  SELECT json_agg(week_row ORDER BY week_number) INTO v_result
  FROM (
    SELECT week_number, 'Week ' || week_number AS week,
      coalesce(income_data.total, 0)::numeric(15,2) AS income,
      coalesce(income_data.total_usd, 0)::numeric(15,2) AS income_usd,
      coalesce(expense_data.total, 0)::numeric(15,2) AS expense,
      coalesce(expense_data.total_usd, 0)::numeric(15,2) AS expense_usd
    FROM generate_series(1, p_weeks_lookahead) week_number
    CROSS JOIN LATERAL (
      SELECT CURRENT_DATE + ((week_number - 1) * 7) AS week_start,
        CURRENT_DATE + (week_number * 7) - 1 AS week_end
    ) week_bounds
    LEFT JOIN LATERAL (
      SELECT sum(CASE WHEN currency = 'ARS' THEN pending_balance ELSE 0 END)::numeric(15,2) AS total,
        sum(CASE WHEN currency = 'USD' THEN pending_balance ELSE 0 END)::numeric(15,2) AS total_usd
      FROM public.accounts_receivable
      WHERE organization_id = p_org_id AND pending_balance > 0
        AND due_date BETWEEN week_bounds.week_start AND week_bounds.week_end
        AND (p_customer_id IS NULL OR customer_id = p_customer_id)
        AND p_supplier_id IS NULL
    ) income_data ON true
    LEFT JOIN LATERAL (
      SELECT sum(CASE WHEN currency = 'ARS' THEN total_amount ELSE 0 END)::numeric(15,2) AS total,
        sum(CASE WHEN currency = 'USD' THEN total_amount ELSE 0 END)::numeric(15,2) AS total_usd
      FROM public.purchase_orders
      WHERE organization_id = p_org_id AND status IN ('ORDERED', 'IN_TRANSIT')
        AND expiration_date BETWEEN week_bounds.week_start AND week_bounds.week_end
        AND (p_supplier_id IS NULL OR supplier_id = p_supplier_id)
        AND p_customer_id IS NULL
    ) expense_data ON true
  ) week_row;
  RETURN coalesce(v_result, '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_order_status_board(
  p_org_id uuid, p_start_date date, p_end_date date, p_customer_id uuid DEFAULT NULL::uuid
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_result json;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Organización inválida'; END IF;
  IF NOT (coalesce(auth.role(), '') = 'service_role'
    OR coalesce(public.user_has_org_permission(p_org_id, 'organization.admin'), false)
    OR coalesce(public.user_has_org_permission(p_org_id, 'dashboard.read'), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para consultar Torre de Control';
  END IF;
  SELECT coalesce(json_agg(order_row), '[]'::json) INTO v_result FROM (
    SELECT so.id, so.invoice_number AS "invoiceNumber", c.business_name AS "customerName",
      so.total_amount AS "totalAmount", so.sale_date::text AS "saleDate", so.status,
      (CURRENT_DATE - so.sale_date)::integer AS "daysOld"
    FROM public.sales_orders so
    JOIN public.customers c ON c.id = so.customer_id AND c.organization_id = so.organization_id
    WHERE so.organization_id = p_org_id AND so.sales_channel = 'WHOLESALE'
      AND so.document_type::text = 'STANDARD'
      AND so.sale_date BETWEEN p_start_date AND p_end_date
      AND so.status NOT IN ('DRAFT', 'CANCELLED', 'DELIVERED') AND so.is_historical = false
      AND (p_customer_id IS NULL OR so.customer_id = p_customer_id)
    ORDER BY so.sale_date DESC LIMIT 50
  ) order_row;
  RETURN v_result;
END;
$function$;

-- Keep the installed profitability cost/currency formulas, and add an explicit
-- wholesale STANDARD source in each of its three verified grouping branches.
-- Fail atomically if the installed shape differs from the reviewed definition.
DO $migration$
DECLARE
  v_function regprocedure;
  v_definition text; v_rewritten text; v_sources integer;
  v_guard text := $guard$BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Organización inválida'; END IF;
  IF NOT (coalesce(auth.role(), '') = 'service_role'
    OR coalesce(public.user_has_org_permission(p_org_id, 'organization.admin'), false)
    OR coalesce(public.user_has_org_permission(p_org_id, 'dashboard.read'), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para consultar rentabilidad';
  END IF;$guard$;
BEGIN
  v_function := pg_catalog.to_regprocedure('public.get_profitability_metrics(uuid,timestamp without time zone,timestamp without time zone,text)');
  IF v_function IS NULL THEN RAISE EXCEPTION 'Falta la RPC de rentabilidad revisada'; END IF;
  IF (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = v_function) THEN
    RAISE EXCEPTION 'Revisar la RPC de rentabilidad: se esperaba SECURITY INVOKER';
  END IF;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  SELECT count(*) INTO v_sources FROM pg_catalog.regexp_matches(v_definition,
    E'\\mFROM\\s+(?:public\\.)?sales_orders\\s+so\\M', 'gi');
  IF v_sources <> 3 OR pg_catalog.strpos(v_definition, 'sales_channel') > 0 THEN
    RAISE EXCEPTION 'La definición instalada de rentabilidad difiere de la revisada; revisar antes de modificar';
  END IF;
  v_rewritten := pg_catalog.regexp_replace(v_definition,
    E'\\mFROM\\s+(?:public\\.)?sales_orders\\s+so\\M',
    'FROM (SELECT * FROM public.sales_orders WHERE organization_id = p_org_id AND sales_channel = ''WHOLESALE'' AND document_type::text = ''STANDARD'') so', 'gi');
  v_rewritten := pg_catalog.regexp_replace(v_rewritten, E'\\mBEGIN\\M', v_guard, 'i');
  EXECUTE v_rewritten;
END;
$migration$;
ALTER FUNCTION public.get_profitability_metrics(uuid, timestamp without time zone, timestamp without time zone, text)
  SECURITY INVOKER;
ALTER FUNCTION public.get_profitability_metrics(uuid, timestamp without time zone, timestamp without time zone, text)
  SET search_path = public, pg_temp;

-- Stock alerts stay invoker/RLS reads. Inventory/dashboard readers retain their
-- existing warehouse scope; Meli-only readers get only the configured warehouse.
DO $migration$
DECLARE
  v_function regprocedure; v_definition text; v_rewritten text; v_sources integer;
  v_declarations text := $declarations$DECLARE
  v_meli_warehouse uuid;
  v_read_context record;
  v_dashboard_access boolean;$declarations$;
  v_guard text := $guard$BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Organización inválida'; END IF;
  v_dashboard_access := coalesce(auth.role(), '') = 'service_role'
    OR coalesce(public.user_has_org_permission(p_org_id, 'organization.admin'), false)
    OR coalesce(public.user_has_org_permission(p_org_id, 'dashboard.read'), false);
  IF NOT v_dashboard_access THEN
    SELECT * INTO v_read_context FROM public.get_inventory_stock_read_context(p_org_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin acceso a la organización';
    END IF;
    IF NOT (v_read_context.can_read_inventory OR v_read_context.can_read_mercadolibre) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para consultar alertas de stock';
    END IF;
    IF NOT v_read_context.can_read_inventory THEN
      v_meli_warehouse := public.resolve_inventory_stock_warehouse(p_org_id, NULL);
    END IF;
  END IF;$guard$;
BEGIN
  v_function := pg_catalog.to_regprocedure('public.get_stock_health_alerts(uuid,uuid,integer)');
  IF v_function IS NULL THEN RAISE EXCEPTION 'Falta la RPC de alertas de stock revisada'; END IF;
  IF (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = v_function) THEN
    RAISE EXCEPTION 'Revisar alertas de stock: se esperaba SECURITY INVOKER';
  END IF;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  SELECT count(*) INTO v_sources FROM pg_catalog.regexp_matches(v_definition,
    E'\\mpl\\.organization_id\\s*=\\s*p_org_id\\M', 'gi');
  IF v_sources <> 1 OR pg_catalog.strpos(v_definition, 'v_meli_warehouse') > 0
    OR pg_catalog.strpos(v_definition, 'scoped_lots as materialized') = 0 THEN
    RAISE EXCEPTION 'La definición de alertas de stock difiere de la revisada; revisar antes de modificar';
  END IF;
  v_rewritten := pg_catalog.regexp_replace(v_definition, E'\\mDECLARE\\M', v_declarations, 'i');
  v_rewritten := pg_catalog.regexp_replace(v_rewritten, E'\\mBEGIN\\M', v_guard, 'i');
  v_rewritten := pg_catalog.regexp_replace(v_rewritten,
    E'\\mpl\\.organization_id\\s*=\\s*p_org_id\\M',
    'pl.organization_id = p_org_id AND (v_meli_warehouse IS NULL OR pl.warehouse_id = v_meli_warehouse)', 'gi');
  EXECUTE v_rewritten;
END;
$migration$;
ALTER FUNCTION public.get_stock_health_alerts(uuid, uuid, integer) SECURITY INVOKER;
ALTER FUNCTION public.get_stock_health_alerts(uuid, uuid, integer) SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_cash_flow_projection(uuid, integer, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_order_status_board(uuid, date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_profitability_metrics(uuid, timestamp without time zone, timestamp without time zone, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_stock_health_alerts(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_flow_projection(uuid, integer, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_order_status_board(uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_profitability_metrics(uuid, timestamp without time zone, timestamp without time zone, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_stock_health_alerts(uuid, uuid, integer) TO authenticated, service_role;
COMMIT;
